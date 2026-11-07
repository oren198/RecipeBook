import { HttpError } from "@/domain/http";
import { requireUser } from "@/server/auth/service";
import { assertSameOrigin, handle, isUuid, json, readJson } from "@/server/http";
import { restoreRevision } from "@/server/recipes/service";

export const POST = handle(async (req, ctx) => {
  assertSameOrigin(req);
  const user = await requireUser(req);
  const id = (await ctx.params).id ?? "";
  if (!isUuid(id)) throw new HttpError(404, "not_found", "המתכון לא נמצא.");
  const body = (await readJson(req)) as { revisionId?: unknown };
  if (typeof body.revisionId !== "string" || !isUuid(body.revisionId)) {
    throw new HttpError(400, "invalid", "חסרה גרסה לשחזור.");
  }
  return json({ recipe: await restoreRevision(user, id, body.revisionId) });
});
