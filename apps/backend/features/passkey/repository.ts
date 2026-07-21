import { eq } from "drizzle-orm";

import type { PasskeyCreate } from "../../../../packages/schemas/passkey";
import { BaseRepository } from "../../database/repository";
import { passkeys } from "./model";

export type Passkey = typeof passkeys.$inferSelect;

export class PasskeyRepository extends BaseRepository {
  async create(input: PasskeyCreate): Promise<Passkey> {
    const [passkey] = await this.database
      .insert(passkeys)
      .values(input)
      .returning();

    if (!passkey) {
      throw new Error("Failed to create passkey");
    }

    return passkey;
  }

  async getById(id: string): Promise<Passkey | null> {
    const [passkey] = await this.database
      .select()
      .from(passkeys)
      .where(eq(passkeys.id, id))
      .limit(1);

    return passkey ?? null;
  }

  async getByCredentialId(credentialId: string): Promise<Passkey | null> {
    const [passkey] = await this.database
      .select()
      .from(passkeys)
      .where(eq(passkeys.credentialId, credentialId))
      .limit(1);

    return passkey ?? null;
  }

  async getByUser(userId: string): Promise<Passkey[]> {
    return this.database
      .select()
      .from(passkeys)
      .where(eq(passkeys.userId, userId));
  }

  async updateSignCount(
    passkeyId: string,
    newSignCount: number,
  ): Promise<Passkey | null> {
    const [passkey] = await this.database
      .update(passkeys)
      .set({ signCount: newSignCount, lastUsedAt: new Date() })
      .where(eq(passkeys.id, passkeyId))
      .returning();

    return passkey ?? null;
  }

  async delete(passkeyId: string): Promise<boolean> {
    const deleted = await this.database
      .delete(passkeys)
      .where(eq(passkeys.id, passkeyId))
      .returning({ id: passkeys.id });

    return deleted.length > 0;
  }
}
