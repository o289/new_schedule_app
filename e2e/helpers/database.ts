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
