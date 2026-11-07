import { logout, requireUser } from "@/server/auth/service";
import { sessionCookie } from "@/server/auth/session";
import { assertSameOrigin, handle, json } from "@/server/http";

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  await requireUser(req);
  await logout(req);
  return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
});
