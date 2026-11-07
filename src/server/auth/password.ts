import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

import { HttpError } from "@/domain/http";

const KEY_LENGTH = 32;
const DEFAULT_N = 16384;

function scrypt(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, { N: DEFAULT_N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${DEFAULT_N}$8$1$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (![16384, 32768].includes(N) || r !== 8 || p !== 1) return false;
  const salt = Buffer.from(parts[4] ?? "", "base64");
  const expected = Buffer.from(parts[5] ?? "", "base64");
  if (salt.length < 16 || expected.length !== KEY_LENGTH) return false;
  const key = await scrypt(password, salt, { N, r, p, maxmem: 64 * 1024 * 1024 });
  if (key.length !== expected.length) return false;
  return timingSafeEqual(key, expected);
}

const DENY = new Set([
  "password",
  "password123",
  "1234567890",
  "123456789",
  "changeme",
  "qwertyuiop",
  "familyrecipes",
  "recipes",
]);

export function assertPasswordAllowed(password: string, username: string): void {
  if (password.length < 10 || password.length > 128) {
    throw new HttpError(400, "weak_password", "הסיסמה צריכה להיות באורך 10 עד 128 תווים.");
  }
  if (DENY.has(password.toLowerCase()) || password.toLowerCase() === username.toLowerCase()) {
    throw new HttpError(400, "weak_password", "בחרו סיסמה אחרת, לא מילה נפוצה ולא שם המשתמש.");
  }
}

let dummyHashPromise: Promise<string> | null = null;

export function dummyPasswordHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(`dummy-${randomBytes(16).toString("hex")}`);
  return dummyHashPromise;
}
