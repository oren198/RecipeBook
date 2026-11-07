import { HttpError } from "@/domain/http";
import { requireUser } from "@/server/auth/service";
import { discardDraft, readDraft } from "@/server/import/service";
import { assertSameOrigin, handle, isUuid, json } from "@/server/http";

export const GET = handle(async (req, ctx) => {
  const user = await requireUser(req);
  const id = (await ctx.params).id ?? "";
  if (!isUuid(id)) throw new HttpError(404, "not_found", "טיוטת הייבוא לא נמצאה.");
  return json({ draft: await readDraft(user, id) });
});

export const DELETE = handle(async (req, ctx) => {
  assertSameOrigin(req);
  const user = await requireUser(req);
  const id = (await ctx.params).id ?? "";
  if (!isUuid(id)) throw new HttpError(404, "not_found", "טיוטת הייבוא לא נמצאה.");
  await discardDraft(user, id);
  return json({ ok: true });
});
