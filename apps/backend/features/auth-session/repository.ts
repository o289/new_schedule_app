import { and, eq, gt, isNull } from "drizzle-orm";

import { BaseRepository } from "#backend/database/repository";
import { authSessions } from "./model";

export type AuthSession = typeof authSessions.$inferSelect;

export class AuthSessionRepository extends BaseRepository {
  async create(input: {
    userId: string;
    refreshTokenDigest: string;
    expiresAt: Date;
  }): Promise<AuthSession> {
    const [session] = await this.database
      .insert(authSessions)
      .values(input)
      .returning();

    if (!session) throw new Error("Failed to create auth session");
    return session;
  }

  async getActiveByRefreshTokenDigest(
    refreshTokenDigest: string,
  ): Promise<AuthSession | null> {
    const [session] = await this.database
      .select()
      .from(authSessions)
      .where(
        and(
          eq(authSessions.refreshTokenDigest, refreshTokenDigest),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    return session ?? null;
  }

  async getActiveById(id: string): Promise<AuthSession | null> {
    const [session] = await this.database
      .select()
      .from(authSessions)
      .where(
        and(
          eq(authSessions.id, id),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    return session ?? null;
  }

  async rotateRefreshToken(
    id: string,
    currentRefreshTokenDigest: string,
    nextRefreshTokenDigest: string,
    expiresAt: Date,
  ): Promise<AuthSession | null> {
    const [session] = await this.database
      .update(authSessions)
      .set({
        refreshTokenDigest: nextRefreshTokenDigest,
        expiresAt,
        lastUsedAt: new Date(),
      })
      .where(
        and(
          eq(authSessions.id, id),
          eq(authSessions.refreshTokenDigest, currentRefreshTokenDigest),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, new Date()),
        ),
      )
      .returning();

    return session ?? null;
  }

  async revokeById(id: string): Promise<boolean> {
    const revoked = await this.database
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(authSessions.id, id), isNull(authSessions.revokedAt)))
      .returning({ id: authSessions.id });

    return revoked.length > 0;
  }

  async revokeAllByUserId(userId: string): Promise<number> {
    const revoked = await this.database
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)),
      )
      .returning({ id: authSessions.id });

    return revoked.length;
  }
}
