import { eq } from "drizzle-orm";

import { BaseRepository } from "../../database/repository";
import { users } from "./model";

export type User = typeof users.$inferSelect;

export class UserRepository extends BaseRepository {
  async createUser(email: string): Promise<User> {
    const [user] = await this.database
      .insert(users)
      .values({ email })
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

  async getByRefreshToken(token: string): Promise<User | null> {
    const [user] = await this.database
      .select()
      .from(users)
      .where(eq(users.refreshToken, token))
      .limit(1);

    return user ?? null;
  }

  async updateRefreshToken(
    userId: string,
    token: string | null,
  ): Promise<User | null> {
    const [user] = await this.database
      .update(users)
      .set({ refreshToken: token })
      .where(eq(users.id, userId))
      .returning();

    return user ?? null;
  }
}
