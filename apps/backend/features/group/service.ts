import {
  AlreadyGroupMemberError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServerError,
} from "#backend/core/api-error";
import type {
  GroupCalendarResponse,
  GroupCreate,
  GroupDetailResponse,
  GroupJoin,
  GroupMemberResponse,
  GroupResponse,
} from "#schemas/group";
import type { User } from "../user/repository";
import { GroupCalendarRepository } from "./calendar-repository";
import {
  digestJoinCode,
  GroupRepository,
  type Group,
  type GroupListItem,
  type GroupMember,
  type GroupMembership,
} from "./repository";

const maxCalendarRangeMilliseconds = 31 * 24 * 60 * 60 * 1000;

function serializeDate(value: Date): string {
  return value.toISOString();
}

function serializeLocalDateTime(value: string): string {
  return value.replace(" ", "T");
}

function groupResponse(
  group: Group | GroupListItem,
  membership: GroupMembership,
  memberCount: number,
): GroupResponse {
  return {
    id: group.id,
    name: group.name,
    currentUserRole: membership.role,
    memberCount,
    createdAt: serializeDate(group.createdAt),
  };
}

function memberResponse(member: GroupMember): GroupMemberResponse {
  return {
    userId: member.userId,
    name: member.name,
    avatar: member.avatar,
    role: member.role,
    joinedAt: serializeDate(member.joinedAt),
  };
}

export class GroupService {
  private readonly repository: GroupRepository;
  private readonly calendarRepository: GroupCalendarRepository;

  constructor(
    repository = new GroupRepository(),
    calendarRepository = new GroupCalendarRepository(),
  ) {
    this.repository = repository;
    this.calendarRepository = calendarRepository;
  }

  async listGroups(user: User): Promise<GroupResponse[]> {
    const groups = await this.repository.listByUser(user.id);

    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      currentUserRole: group.currentUserRole,
      memberCount: group.memberCount,
      createdAt: serializeDate(group.createdAt),
    }));
  }

  async getGroup(user: User, groupId: string): Promise<GroupDetailResponse> {
    const membership = await this.requireMembership(user.id, groupId);
    const [group, members] = await Promise.all([
      this.repository.getById(groupId),
      this.repository.listMembers(groupId),
    ]);
    if (!group) {
      throw new NotFoundError("NOT_FOUND_GROUP");
    }

    return {
      group: groupResponse(group, membership, members.length),
      members: members.map(memberResponse),
    };
  }

  async createGroup(
    user: User,
    input: GroupCreate,
  ): Promise<{ group: GroupResponse; joinCode: string }> {
    const created = await this.repository.createWithGeneratedJoinCode(
      input,
      user.id,
    );
    const membership = await this.repository.getMembership(
      created.group.id,
      user.id,
    );
    if (!membership) {
      throw new ServerError("SERVER_ERROR");
    }

    return {
      group: groupResponse(created.group, membership, 1),
      joinCode: created.joinCode,
    };
  }

  async deleteGroup(user: User, groupId: string): Promise<void> {
    await this.requireOwner(user.id, groupId);
    if (!(await this.repository.deleteGroup(groupId))) {
      throw new NotFoundError("NOT_FOUND_GROUP");
    }
  }

  async regenerateInvitation(
    user: User,
    groupId: string,
  ): Promise<{ joinCode: string }> {
    await this.requireOwner(user.id, groupId);
    const invitation = await this.repository.regenerateJoinCode(groupId);
    if (!invitation) {
      throw new NotFoundError("NOT_FOUND_GROUP");
    }
    return invitation;
  }

  async joinGroup(user: User, input: GroupJoin): Promise<GroupResponse> {
    const result = await this.repository.joinIfAllowed(
      digestJoinCode(input.joinCode),
      user.id,
    );
    if (result.kind === "not-found") {
      throw new NotFoundError("INVALID_JOIN_CODE");
    }
    if (result.kind === "banned") {
      throw new ForbiddenError("GROUP_REJOIN_FORBIDDEN");
    }
    if (result.kind === "already-member") {
      throw new AlreadyGroupMemberError(result.membership.groupId);
    }
    if (result.kind === "full") {
      throw new ConflictError("GROUP_MEMBER_LIMIT_REACHED");
    }

    const group = await this.repository.getById(result.membership.groupId);
    if (!group) {
      throw new ServerError("SERVER_ERROR");
    }
    const members = await this.repository.listMembers(group.id);
    return groupResponse(group, result.membership, members.length);
  }

  async kickMember(
    user: User,
    groupId: string,
    memberUserId: string,
  ): Promise<void> {
    await this.requireOwner(user.id, groupId);
    if (memberUserId === user.id) {
      throw new BadRequestError("CANNOT_REMOVE_SELF");
    }

    const member = await this.repository.getMembership(groupId, memberUserId);
    if (!member) {
      throw new NotFoundError("NOT_FOUND_GROUP_MEMBER");
    }
    if (member.role === "owner") {
      throw new BadRequestError("CANNOT_REMOVE_OWNER");
    }
    if (!(await this.repository.kickAndBan(groupId, user.id, memberUserId))) {
      throw new NotFoundError("NOT_FOUND_GROUP_MEMBER");
    }
  }

  async leaveGroup(user: User, groupId: string): Promise<void> {
    const membership = await this.requireMembership(user.id, groupId);
    if (membership.role === "owner") {
      throw new BadRequestError("OWNER_CANNOT_LEAVE");
    }
    if (!(await this.repository.leave(groupId, user.id))) {
      throw new NotFoundError("NOT_FOUND_GROUP");
    }
  }

  async listCalendar(
    user: User,
    groupId: string,
    range: { startDate: string; endDate: string },
  ): Promise<GroupCalendarResponse> {
    await this.requireMembership(user.id, groupId);
    this.validateCalendarRange(range);

    const snapshot = await this.calendarRepository.getCompleteCalendarSnapshot(
      groupId,
      range.startDate,
      range.endDate,
    );
    if (snapshot.members.length < 1 || snapshot.members.length > 5) {
      throw new ServerError("SERVER_ERROR");
    }

    return {
      groupId,
      requestedMemberCount: snapshot.members.length,
      fetchedMemberCount: snapshot.members.length,
      completeness: "complete",
      members: snapshot.members.map(memberResponse),
      events: snapshot.events.map((event) => ({
        dateId: event.dateId,
        member: {
          userId: event.userId,
          name: event.name,
          avatar: event.avatar,
        },
        startDate: serializeLocalDateTime(event.startDate),
        endDate: serializeLocalDateTime(event.endDate),
      })),
    };
  }

  private async requireMembership(
    userId: string,
    groupId: string,
  ): Promise<GroupMembership> {
    const membership = await this.repository.getMembership(groupId, userId);
    if (!membership) {
      throw new NotFoundError("NOT_FOUND_GROUP");
    }
    return membership;
  }

  private async requireOwner(
    userId: string,
    groupId: string,
  ): Promise<GroupMembership> {
    const membership = await this.requireMembership(userId, groupId);
    if (membership.role !== "owner") {
      throw new ForbiddenError("GROUP_OWNER_REQUIRED");
    }
    return membership;
  }

  private validateCalendarRange(range: {
    startDate: string;
    endDate: string;
  }): void {
    const start = Date.parse(`${range.startDate}Z`);
    const end = Date.parse(`${range.endDate}Z`);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start ||
      end - start > maxCalendarRangeMilliseconds
    ) {
      throw new BadRequestError("INVALID_DATE_RANGE");
    }
  }
}
