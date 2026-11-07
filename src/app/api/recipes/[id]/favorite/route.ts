import { HttpError } from "@/domain/http";
import { requireUser } from "@/server/auth/service";
import { assertSameOrigin, handle, isUuid, json, readJson } from "@/server/http";
import { toggleFavorite } from "@/server/recipes/service";

export const POST = handle(async (req, ctx) => {
  assertSameOrigin(req);
  const user = await requireUser(req);
  const id = (await ctx.params).id ?? "";
  if (!isUuid(id)) throw new HttpError(404, "not_found", "המתכון לא נמצא.");
  const body = (await readJson(req)) as { favorite?: unknown };
  if (typeof body.favorite !== "boolean") throw new HttpError(400, "invalid", "חסר מצב מועדפים.");
  return json({ recipe: await toggleFavorite(user, id, body.favorite) });
});
