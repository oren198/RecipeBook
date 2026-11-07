import { HttpError } from "@/domain/http";
import { parseRecipeInput } from "@/domain/recipe";
import { requireUser } from "@/server/auth/service";
import { commitDraft } from "@/server/import/service";
import { assertSameOrigin, handle, isUuid, json, readJson } from "@/server/http";

export const POST = handle(async (req, ctx) => {
  assertSameOrigin(req);
  const user = await requireUser(req);
  const id = (await ctx.params).id ?? "";
  if (!isUuid(id)) throw new HttpError(404, "not_found", "טיוטת הייבוא לא נמצאה.");
  const recipe = await commitDraft(user, id, parseRecipeInput(await readJson(req)));
  return json({ recipe }, 201);
});
