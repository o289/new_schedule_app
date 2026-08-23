import { Client } from "pg";

import { assertE2EDatabaseUrl } from "../environment";

export async function resetE2EDatabase(databaseUrl: string): Promise<void> {
  assertE2EDatabaseUrl(databaseUrl);

  const client = new Client({ connectionString: databaseUrl });

  await client.connect();

  try {
    await client.query("TRUNCATE TABLE users CASCADE");
  } finally {
    await client.end();
  }
}

export async function countGroupMembers(
  databaseUrl: string,
  groupId: string,
): Promise<number> {
  assertE2EDatabaseUrl(databaseUrl);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const result = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM group_members WHERE group_id = $1",
      [groupId],
    );
    return Number(result.rows[0]?.count ?? 0);
  } finally {
    await client.end();
  }
}
