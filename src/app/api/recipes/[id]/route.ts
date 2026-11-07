import { HttpError } from "@/domain/http";
import { parseRecipeInput } from "@/domain/recipe";
import { requireUser } from "@/server/auth/service";
import { assertSameOrigin, handle, isUuid, json, readJson } from "@/server/http";
import { readRecipe, removeRecipe, updateRecipe } from "@/server/recipes/service";

function idFrom(params: Record<string, string>): string {
  const id = params.id ?? "";
  if (!isUuid(id)) throw new HttpError(404, "not_found", "המתכון לא נמצא.");
  return id;
}

export const GET = handle(async (req, ctx) => {
  const user = await requireUser(req);
  return json({ recipe: await readRecipe(user, idFrom(await ctx.params)) });
});

export const PATCH = handle(async (req, ctx) => {
  assertSameOrigin(req);
  const user = await requireUser(req);
  const recipe = await updateRecipe(user, idFrom(await ctx.params), parseRecipeInput(await readJson(req)));
  return json({ recipe });
});

export const DELETE = handle(async (req, ctx) => {
  assertSameOrigin(req);
  const user = await requireUser(req);
  await removeRecipe(user, idFrom(await ctx.params));
  return json({ ok: true });
});
