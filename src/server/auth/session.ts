import { createHmac, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "family_session";
const FOURTEEN_DAYS = 60 * 60 * 24 * 14;

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  const pepper = process.env.SESSION_SECRET ?? "";
  if (pepper.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }
  return createHmac("sha256", pepper).update(token).digest("hex");
}

export function sessionExpiry(from = new Date()): Date {
  return new Date(from.getTime() + FOURTEEN_DAYS * 1000);
}

export function sessionCookie(token: string, maxAge = FOURTEEN_DAYS): string {
  const secure = process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "1";
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}
