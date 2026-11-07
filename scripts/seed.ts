import { eq } from "drizzle-orm";

import { closeDb, getDb } from "../src/server/db/client";
import { families, users } from "../src/server/db/schema";
import { insertExamples } from "../src/server/recipes/service";

if (process.env.NODE_ENV === "production" && process.env.SEED_EXAMPLES !== "1") {
  console.error("Refusing to seed example recipes in production without SEED_EXAMPLES=1");
  process.exit(1);
}

const db = getDb();
const rows = await db
  .select({
    id: users.id,
    familyId: users.familyId,
    username: users.username,
    displayName: users.displayName,
    familyName: families.name,
  })
  .from(users)
  .innerJoin(families, eq(families.id, users.familyId));

if (rows.length !== 1) {
  console.error("Seed examples after the single family account exists. Found", rows.length, "users.");
  await closeDb();
  process.exit(1);
}

const row = rows[0];
if (!row) {
  await closeDb();
  process.exit(1);
}
const added = await insertExamples({ ...row, displayName: row.displayName });
console.log(`Added ${added} labeled example recipes.`);
await closeDb();
