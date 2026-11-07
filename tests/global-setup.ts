export default async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for integration tests");
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) {
    throw new Error("SESSION_SECRET is required for integration tests");
  }
  const { migrateDatabase } = await import("../src/server/db/migrate");
  const { closeDb } = await import("../src/server/db/client");
  await migrateDatabase();
  await closeDb();
}
