import { createHash, randomBytes } from "node:crypto";

import { and, count, eq, sql } from "drizzle-orm";

import { db } from "#backend/database/client";
import {
  BaseRepository,
  type Database,
  type Transaction,
} from "#backend/database/repository";
import { normalizeJoinCode, type GroupCreate } from "#schemas/group";
import type { AvatarKey } from "#schemas/user";
import { users } from "../user/model";
import { groupBannedMembers, groupMembers, groups } from "./model";

const maxGroupMembers = 5;
const maxJoinCodeGenerationAttempts = 3;

export type Group = typeof groups.$inferSelect;
export type GroupMembership = typeof groupMembers.$inferSelect;

export type GroupMember = {
  userId: string;
  name: string;
  avatar: AvatarKey | null;
  role: GroupMembership["role"];
  joinedAt: Date;
};

export type GroupListItem = Omit<Group, "joinCodeDigest"> & {
  currentUserRole: GroupMembership["role"];
  memberCount: number;
};

export type JoinGroupResult =
  | { kind: "joined"; membership: GroupMembership }
  | { kind: "already-member"; membership: GroupMembership }
  | { kind: "not-found" }
  | { kind: "banned" }
  | { kind: "full" };

export type GroupCreationResult = {
  group: Group;
  joinCode: string;
};

export type GroupInvitationResult = {
  joinCode: string;
};

export function digestJoinCode(joinCode: string): string {
  return createHash("sha256").update(normalizeJoinCode(joinCode)).digest("hex");
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

class TransactionScopedGroupRepository extends BaseRepository {
  constructor(database: Database | Transaction) {
    super(database);
  }

  async createWithOwner(
    input: GroupCreate,
    ownerUserId: string,
    joinCodeDigest: string,
  ): Promise<Group> {
    const [group] = await this.database
      .insert(groups)
      .values({ name: input.name, joinCodeDigest })
      .returning();

    if (!group) {
      throw new Error("Failed to create group");
    }

    await this.database.insert(groupMembers).values({
      groupId: group.id,
      userId: ownerUserId,
      role: "owner",
    });

    return group;
  }

  async getByJoinCodeDigestForUpdate(digest: string): Promise<Group | null> {
    const [group] = await this.database
      .select()
      .from(groups)
      .where(eq(groups.joinCodeDigest, digest))
      .for("update")
      .limit(1);

    return group ?? null;
  }

  async getMembership(
    groupId: string,
    userId: string,
  ): Promise<GroupMembership | null> {
    const [membership] = await this.database
      .select()
      .from(groupMembers)
      .where(
        and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)),
      )
      .limit(1);

    return membership ?? null;
  }

  async isBanned(groupId: string, userId: string): Promise<boolean> {
    const [ban] = await this.database
      .select({ groupId: groupBannedMembers.groupId })
      .from(groupBannedMembers)
      .where(
        and(
          eq(groupBannedMembers.groupId, groupId),
          eq(groupBannedMembers.userId, userId),
        ),
      )
      .limit(1);

    return ban !== undefined;
  }

  async countMembers(groupId: string): Promise<number> {
    const [result] = await this.database
      .select({ count: count() })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId));

    return result?.count ?? 0;
  }
}

export class GroupRepository extends BaseRepository {
  constructor(database: Database = db) {
    super(database);
  }

  async createWithOwner(
    input: GroupCreate,
    ownerUserId: string,
    joinCodeDigest: string,
  ): Promise<Group> {
    return this.database.transaction(async (transaction) =>
      new TransactionScopedGroupRepository(transaction).createWithOwner(
        input,
        ownerUserId,
        joinCodeDigest,
      ),
    );
  }

  async createWithGeneratedJoinCode(
    input: GroupCreate,
    ownerUserId: string,
  ): Promise<GroupCreationResult> {
    const generated = await this.withGeneratedJoinCode((joinCodeDigest) =>
      this.createWithOwner(input, ownerUserId, joinCodeDigest),
    );

    return { group: generated.result, joinCode: generated.joinCode };
  }

  async regenerateJoinCode(
    groupId: string,
  ): Promise<GroupInvitationResult | null> {
    const generated = await this.withGeneratedJoinCode(
      async (joinCodeDigest) => {
        const [group] = await this.database
          .update(groups)
          .set({ joinCodeDigest })
          .where(eq(groups.id, groupId))
          .returning({ id: groups.id });

        return group !== undefined;
      },
    );

    if (!generated.result) return null;
    return { joinCode: generated.joinCode };
  }

  private async withGeneratedJoinCode<T>(
    operation: (joinCodeDigest: string) => Promise<T>,
  ): Promise<{ result: T; joinCode: string }> {
    for (
      let attempt = 0;
      attempt < maxJoinCodeGenerationAttempts;
      attempt += 1
    ) {
      const joinCode = normalizeJoinCode(randomBytes(18).toString("base64url"));

      try {
        const result = await operation(digestJoinCode(joinCode));
        return { result, joinCode };
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }
      }
    }

    throw new Error("Failed to generate a unique join code");
  }

  async getById(groupId: string): Promise<Group | null> {
    const [group] = await this.database
      .select()
      .from(groups)
      .where(eq(groups.id, groupId))
      .limit(1);

    return group ?? null;
  }

  async listByUser(userId: string): Promise<GroupListItem[]> {
    return (await this.database
      .select({
        id: groups.id,
        name: groups.name,
        createdAt: groups.createdAt,
        currentUserRole: groupMembers.role,
        memberCount: sql<number>`(
          SELECT count(*)::int
          FROM ${groupMembers} AS member_count
          WHERE member_count.group_id = ${groups.id}
        )`,
      })
      .from(groupMembers)
      .innerJoin(groups, eq(groupMembers.groupId, groups.id))
      .where(eq(groupMembers.userId, userId))) as GroupListItem[];
  }

  async getMembership(
    groupId: string,
    userId: string,
  ): Promise<GroupMembership | null> {
    return new TransactionScopedGroupRepository(this.database).getMembership(
      groupId,
      userId,
    );
  }

  async listMembers(groupId: string): Promise<GroupMember[]> {
    return (await this.database
      .select({
        userId: users.id,
        name: users.name,
        avatar: users.avatar,
        role: groupMembers.role,
        joinedAt: groupMembers.joinedAt,
      })
      .from(groupMembers)
      .innerJoin(users, eq(groupMembers.userId, users.id))
      .where(eq(groupMembers.groupId, groupId))) as GroupMember[];
  }

  async getByJoinCodeDigestForUpdate(
    transaction: Transaction,
    digest: string,
  ): Promise<Group | null> {
    return new TransactionScopedGroupRepository(
      transaction,
    ).getByJoinCodeDigestForUpdate(digest);
  }

  async joinIfAllowed(
    digest: string,
    userId: string,
  ): Promise<JoinGroupResult> {
    return this.database.transaction(async (transaction) => {
      const transactionRepository = new TransactionScopedGroupRepository(
        transaction,
      );
      const group =
        await transactionRepository.getByJoinCodeDigestForUpdate(digest);

      if (!group) {
        return { kind: "not-found" };
      }

      if (await transactionRepository.isBanned(group.id, userId)) {
        return { kind: "banned" };
      }

      const existingMembership = await transactionRepository.getMembership(
        group.id,
        userId,
      );
      if (existingMembership) {
        return { kind: "already-member", membership: existingMembership };
      }

      if (
        (await transactionRepository.countMembers(group.id)) >= maxGroupMembers
      ) {
        return { kind: "full" };
      }

      const [membership] = await transaction
        .insert(groupMembers)
        .values({ groupId: group.id, userId, role: "member" })
        .returning();

      if (!membership) {
        throw new Error("Failed to join group");
      }

      return { kind: "joined", membership };
    });
  }

  async isBanned(groupId: string, userId: string): Promise<boolean> {
    return new TransactionScopedGroupRepository(this.database).isBanned(
      groupId,
      userId,
    );
  }

  async kickAndBan(
    groupId: string,
    ownerUserId: string,
    memberUserId: string,
  ): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      const transactionRepository = new TransactionScopedGroupRepository(
        transaction,
      );
      const [group] = await transaction
        .select({ id: groups.id })
        .from(groups)
        .where(eq(groups.id, groupId))
        .for("update")
        .limit(1);
      if (!group) {
        return false;
      }

      const owner = await transactionRepository.getMembership(
        groupId,
        ownerUserId,
      );
      const member = await transactionRepository.getMembership(
        groupId,
        memberUserId,
      );
      if (owner?.role !== "owner" || member?.role !== "member") {
        return false;
      }

      await transaction
        .insert(groupBannedMembers)
        .values({
          groupId,
          userId: memberUserId,
          bannedByUserId: ownerUserId,
        })
        .onConflictDoNothing();
      await transaction
        .delete(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.userId, memberUserId),
          ),
        );

      return true;
    });
  }

  async leave(groupId: string, userId: string): Promise<boolean> {
    const deleted = await this.database
      .delete(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId),
          eq(groupMembers.role, "member"),
        ),
      )
      .returning({ userId: groupMembers.userId });

    return deleted.length > 0;
  }

  async deleteGroup(groupId: string): Promise<boolean> {
    const deleted = await this.database
      .delete(groups)
      .where(eq(groups.id, groupId))
      .returning({ id: groups.id });

    return deleted.length > 0;
  }
}
