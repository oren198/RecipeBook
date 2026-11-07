import { HttpError } from "@/domain/http";
import { requireUser } from "@/server/auth/service";
import { importUrl } from "@/server/import/service";
import { assertSameOrigin, clientIp, handle, json, readJson } from "@/server/http";

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser(req);
  const body = (await readJson(req)) as { url?: unknown };
  if (typeof body.url !== "string" || !body.url.trim()) {
    throw new HttpError(400, "invalid", "חסרה כתובת לייבוא.");
  }
  const draft = await importUrl(user, body.url, clientIp(req));
  return json({ draft }, 201);
});
