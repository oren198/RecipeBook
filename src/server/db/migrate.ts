import { migrate } from "drizzle-orm/postgres-js/migrator";

import { getDb, getSql } from "@/server/db/client";

const MIGRATION_LOCK = 814271;

export async function migrateDatabase(migrationsFolder = "./drizzle"): Promise<void> {
  const sql = getSql();
  await sql`select pg_advisory_lock(${MIGRATION_LOCK})`;
  try {
    await migrate(getDb(), { migrationsFolder });
  } finally {
    await sql`select pg_advisory_unlock(${MIGRATION_LOCK})`;
  }
}
