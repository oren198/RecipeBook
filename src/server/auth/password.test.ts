import { describe, expect, it } from "vitest";

import { HttpError } from "@/domain/http";
import { assertPasswordAllowed, hashPassword, verifyPassword } from "@/server/auth/password";

describe("passwords", () => {
  it("hashes and rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong horse battery", hash)).toBe(false);
    expect(await verifyPassword("correct horse battery", "nope")).toBe(false);
  });

  it("rejects short and common passwords", () => {
    expect(() => assertPasswordAllowed("short", "family")).toThrow(HttpError);
    expect(() => assertPasswordAllowed("password123", "family")).toThrow(HttpError);
    expect(() => assertPasswordAllowed("a reasonably long secret", "family")).not.toThrow();
  });
});
