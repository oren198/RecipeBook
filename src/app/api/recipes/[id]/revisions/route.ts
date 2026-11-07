import { HttpError } from "@/domain/http";
import { requireUser } from "@/server/auth/service";
import { handle, isUuid, json } from "@/server/http";
import { listRevisions } from "@/server/recipes/service";

export const GET = handle(async (req, ctx) => {
  const user = await requireUser(req);
  const id = (await ctx.params).id ?? "";
  if (!isUuid(id)) throw new HttpError(404, "not_found", "המתכון לא נמצא.");
  return json({ revisions: await listRevisions(user, id) });
});
