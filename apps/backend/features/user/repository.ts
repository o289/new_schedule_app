import { eq } from "drizzle-orm";

import { BaseRepository } from "#backend/database/repository";
import type { AvatarKey } from "#schemas/user";
import { users } from "./model";

export type User = typeof users.$inferSelect;

export class UserRepository extends BaseRepository {
  async createUser(email: string, name: string): Promise<User> {
    const [user] = await this.database
      .insert(users)
      .values({ email, name, avatar: null })
      .returning();

    if (!user) {
      throw new Error("Failed to create user");
    }

    return user;
  }

  async getById(id: string): Promise<User | null> {
    const [user] = await this.database
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return user ?? null;
  }

  async getByEmail(email: string): Promise<User | null> {
    const [user] = await this.database
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return user ?? null;
  }

  async updateProfile(
    userId: string,
    profile: { name: string; avatar: AvatarKey | null },
  ): Promise<User | null> {
    const [user] = await this.database
      .update(users)
      .set(profile)
      .where(eq(users.id, userId))
      .returning();

    return user ?? null;
  }
}
