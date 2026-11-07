import { login } from "@/server/auth/service";
import { sessionCookie } from "@/server/auth/session";
import { assertSameOrigin, clientIp, handle, json, readJson } from "@/server/http";
import { HttpError } from "@/domain/http";

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const body = (await readJson(req)) as { username?: unknown; password?: unknown };
  if (typeof body.username !== "string" || typeof body.password !== "string") {
    throw new HttpError(400, "invalid", "חסרים שם משתמש או סיסמה.");
  }
  const result = await login({ username: body.username, password: body.password, ip: clientIp(req) });
  return json({ user: result.user }, 200, { "set-cookie": sessionCookie(result.token) });
});
