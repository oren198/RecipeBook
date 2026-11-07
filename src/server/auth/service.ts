import { timingSafeEqual } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { HttpError } from "@/domain/http";
import { assertPasswordAllowed, dummyPasswordHash, hashPassword, verifyPassword } from "@/server/auth/password";
import { consumeRateLimit } from "@/server/auth/rate-limit";
import { hashSessionToken, newSessionToken, readCookie, SESSION_COOKIE, sessionExpiry } from "@/server/auth/session";
import type { CurrentUser } from "@/server/auth/types";
import { getDb } from "@/server/db/client";
import { families, sessions, users } from "@/server/db/schema";

const USERNAME_RE = /^[\p{L}\p{N}_.-]{3,40}$/u;

export async function countUsers(): Promise<number> {
  const db = getDb();
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  return Number(row?.count ?? 0);
}

export async function isSetupOpen(): Promise<boolean> {
  return (await countUsers()) === 0;
}

function assertSetupSecret(provided: string | null): void {
  const configured = process.env.SETUP_SECRET?.trim() ?? "";
  const production = process.env.NODE_ENV === "production";
  if (production && configured.length < 16) {
    throw new HttpError(403, "setup_secret_required", "ההקמה חסומה עד שמגדירים SETUP_SECRET בשרת.");
  }
  if (!configured) return;
  const left = Buffer.from(provided ?? "");
  const right = Buffer.from(configured);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new HttpError(403, "setup_secret_rejected", "סוד ההקמה אינו תואם.");
  }
}

function assertIdentity(familyName: string, username: string): void {
  const name = familyName.trim();
  if (name.length < 2 || name.length > 80 || /[\u0000-\u001F]/.test(name)) {
    throw new HttpError(400, "invalid", "שם הספר צריך להיות בין 2 ל-80 תווים.");
  }
  if (!USERNAME_RE.test(username.trim())) {
    throw new HttpError(400, "invalid", "שם המשתמש: 3 עד 40 אותיות, ספרות, נקודה, מקף או קו תחתון.");
  }
}

function toCurrent(user: { id: string; familyId: string; username: string; displayName: string }, familyName: string): CurrentUser {
  return {
    id: user.id,
    familyId: user.familyId,
    familyName,
    username: user.username,
    displayName: user.displayName,
  };
}

export async function bootstrapFamily(input: {
  familyName: string;
  username: string;
  password: string;
  setupSecret: string | null;
  ip: string;
}): Promise<{ user: CurrentUser; token: string }> {
  assertSetupSecret(input.setupSecret);
  assertIdentity(input.familyName, input.username);
  assertPasswordAllowed(input.password, input.username);
  await consumeRateLimit(`setup:${input.ip}`, 5, 60 * 60 * 1000);
  const passwordHash = await hashPassword(input.password);
  const token = newSessionToken();
  const tokenHash = hashSessionToken(token);
  const db = getDb();
  try {
    const user = await db.transaction(async (tx) => {
      await tx.execute(sql`lock table users in exclusive mode`);
      const [countRow] = await tx.select({ count: sql<number>`count(*)::int` }).from(users);
      if (Number(countRow?.count ?? 0) > 0) {
        throw new HttpError(409, "setup_closed", "הספר כבר הוקם. אפשר להתחבר.");
      }
      const [family] = await tx.insert(families).values({ name: input.familyName.trim() }).returning();
      if (!family) throw new HttpError(500, "internal", "ההקמה נכשלה");
      const [userRow] = await tx
        .insert(users)
        .values({
          familyId: family.id,
          username: input.username.trim(),
          displayName: input.familyName.trim(),
          passwordHash,
        })
        .returning();
      if (!userRow) throw new HttpError(500, "internal", "ההקמה נכשלה");
      await tx.insert(sessions).values({
        userId: userRow.id,
        tokenHash,
        expiresAt: sessionExpiry(),
      });
      return toCurrent(userRow, family.name);
    });
    return { user, token };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "23505") {
      throw new HttpError(409, "setup_closed", "הספר כבר הוקם. אפשר להתחבר.");
    }
    throw error;
  }
}

export async function login(input: { username: string; password: string; ip: string }): Promise<{ user: CurrentUser; token: string }> {
  const username = input.username.trim().toLowerCase();
  await consumeRateLimit(`login:user:${username}`, 20, 15 * 60 * 1000);
  await consumeRateLimit(`login:ip:${input.ip}`, 30, 15 * 60 * 1000);
  await consumeRateLimit(`login:pair:${input.ip}:${username}`, 8, 15 * 60 * 1000);
  const db = getDb();
  const [row] = await db
    .select({
      id: users.id,
      familyId: users.familyId,
      username: users.username,
      displayName: users.displayName,
      passwordHash: users.passwordHash,
      familyName: families.name,
    })
    .from(users)
    .innerJoin(families, eq(families.id, users.familyId))
    .where(sql`lower(${users.username}) = ${username}`)
    .limit(1);
  const hash = row?.passwordHash ?? (await dummyPasswordHash());
  const matches = await verifyPassword(input.password, hash);
  if (!row || !matches) {
    throw new HttpError(401, "invalid_login", "שם המשתמש או הסיסמה אינם נכונים.");
  }
  const token = newSessionToken();
  await db.insert(sessions).values({
    userId: row.id,
    tokenHash: hashSessionToken(token),
    expiresAt: sessionExpiry(),
  });
  return { user: toCurrent(row, row.familyName), token };
}

export async function userFromToken(token: string | null | undefined): Promise<CurrentUser | null> {
  if (!token) return null;
  const db = getDb();
  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      id: users.id,
      familyId: users.familyId,
      username: users.username,
      displayName: users.displayName,
      familyName: families.name,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(families, eq(families.id, users.familyId))
    .where(eq(sessions.tokenHash, hashSessionToken(token)))
    .limit(1);
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, row.sessionId));
    return null;
  }
  return toCurrent(row, row.familyName);
}

export async function requireUser(req: Request): Promise<CurrentUser> {
  const user = await userFromToken(readCookie(req, SESSION_COOKIE));
  if (!user) {
    throw new HttpError(401, "unauthorized", "צריך להתחבר כדי לפתוח את הספר.");
  }
  return user;
}

export async function logout(req: Request): Promise<void> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return;
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
}

export async function setupStatus(): Promise<{ needsSetup: boolean; productionSecretRequired: boolean }> {
  const needsSetup = await isSetupOpen();
  const productionSecretRequired = process.env.NODE_ENV === "production" && (process.env.SETUP_SECRET?.trim().length ?? 0) < 16;
  return { needsSetup, productionSecretRequired };
}

export async function deleteSessionsForUser(userId: string): Promise<void> {
  const db = getDb();
  await db.delete(sessions).where(and(eq(sessions.userId, userId)));
}
