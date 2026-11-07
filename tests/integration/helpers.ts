import { rm } from "node:fs/promises";

import { eq } from "drizzle-orm";

import { hashPassword } from "@/server/auth/password";
import { getDb, getSql } from "@/server/db/client";
import { families, users } from "@/server/db/schema";
import { uploadRoot } from "@/server/storage/files";

export async function resetDatabase(): Promise<void> {
  const sql = getSql();
  await sql`truncate table families, rate_limits restart identity cascade`;
  await rm(uploadRoot(), { recursive: true, force: true });
}

export function originHeaders(cookie?: string): Headers {
  const headers = new Headers({
    origin: "http://127.0.0.1:43123",
    host: "127.0.0.1:43123",
    "content-type": "application/json",
  });
  if (cookie) headers.set("cookie", cookie);
  return headers;
}

export async function insertSecondFamily(): Promise<{ id: string; familyId: string }> {
  const db = getDb();
  const [family] = await db.insert(families).values({ name: "בית אחר" }).returning();
  if (!family) throw new Error("family missing");
  const [user] = await db
    .insert(users)
    .values({
      familyId: family.id,
      username: "other-house",
      displayName: "בית אחר",
      passwordHash: await hashPassword("another-house-password"),
    })
    .returning();
  if (!user) throw new Error("user missing");
  return { id: user.id, familyId: family.id };
}

export async function familyCount(): Promise<number> {
  const db = getDb();
  const rows = await db.select({ id: families.id }).from(families);
  return rows.length;
}

export async function recipeCountFor(familyId: string): Promise<number> {
  const { recipes } = await import("@/server/db/schema");
  const db = getDb();
  const rows = await db.select({ id: recipes.id }).from(recipes).where(eq(recipes.familyId, familyId));
  return rows.length;
}
