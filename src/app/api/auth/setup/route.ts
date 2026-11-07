import { HttpError } from "@/domain/http";
import { bootstrapFamily } from "@/server/auth/service";
import { sessionCookie } from "@/server/auth/session";
import { assertSameOrigin, clientIp, handle, json, readJson } from "@/server/http";

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const body = (await readJson(req)) as {
    familyName?: unknown;
    username?: unknown;
    password?: unknown;
    setupSecret?: unknown;
  };
  if (typeof body.familyName !== "string" || typeof body.username !== "string" || typeof body.password !== "string") {
    throw new HttpError(400, "invalid", "חסרים פרטי ההקמה.");
  }
  const result = await bootstrapFamily({
    familyName: body.familyName,
    username: body.username,
    password: body.password,
    setupSecret: typeof body.setupSecret === "string" ? body.setupSecret : null,
    ip: clientIp(req),
  });
  return json({ user: result.user }, 201, { "set-cookie": sessionCookie(result.token) });
});
