import { closeDb } from "../src/server/db/client";
import { migrateDatabase } from "../src/server/db/migrate";

await migrateDatabase();
await closeDb();
