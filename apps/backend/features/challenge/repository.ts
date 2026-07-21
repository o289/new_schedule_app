import { eq, lt } from "drizzle-orm";

import type { ChallengeCreate } from "../../../../packages/schemas/challenge";
import { BaseRepository } from "../../database/repository";
import { challenges } from "./model";

export type Challenge = typeof challenges.$inferSelect;

export class ChallengeRepository extends BaseRepository {
  async createOrReplace(input: ChallengeCreate): Promise<Challenge> {
    const values = {
      userId: input.userId,
      challenge: input.challenge,
      type: input.type,
      expiresAt: new Date(input.expiresAt),
    };

    const [challenge] = await this.database
      .insert(challenges)
      .values(values)
      .onConflictDoUpdate({
        target: challenges.userId,
        set: {
          challenge: values.challenge,
          type: values.type,
          expiresAt: values.expiresAt,
        },
      })
      .returning();

    if (!challenge) {
      throw new Error("Failed to create or replace challenge");
    }

    return challenge;
  }

  async getById(id: string): Promise<Challenge | null> {
    const [challenge] = await this.database
      .select()
      .from(challenges)
      .where(eq(challenges.id, id))
      .limit(1);

    return challenge ?? null;
  }

  async getByUser(userId: string): Promise<Challenge | null> {
    const [challenge] = await this.database
      .select()
      .from(challenges)
      .where(eq(challenges.userId, userId))
      .limit(1);

    return challenge ?? null;
  }

  async getByChallenge(value: string): Promise<Challenge | null> {
    const [challenge] = await this.database
      .select()
      .from(challenges)
      .where(eq(challenges.challenge, value))
      .limit(1);

    return challenge ?? null;
  }

  async deleteByUser(userId: string): Promise<boolean> {
    const deleted = await this.database
      .delete(challenges)
      .where(eq(challenges.userId, userId))
      .returning({ id: challenges.id });

    return deleted.length > 0;
  }

  async deleteExpired(): Promise<number> {
    const deleted = await this.database
      .delete(challenges)
      .where(lt(challenges.expiresAt, new Date()))
      .returning({ id: challenges.id });

    return deleted.length;
  }
}
