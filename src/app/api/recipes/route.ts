import { parseRecipeInput } from "@/domain/recipe";
import { requireUser } from "@/server/auth/service";
import { assertSameOrigin, handle, json, readJson } from "@/server/http";
import { createManualRecipe, listRecipes } from "@/server/recipes/service";

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const url = new URL(req.url);
  const recipes = await listRecipes(user, {
    q: url.searchParams.get("q") ?? "",
    category: url.searchParams.get("category"),
    tag: url.searchParams.get("tag"),
    favorite: url.searchParams.get("favorite") === "1",
  });
  return json({ recipes });
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser(req);
  const recipe = await createManualRecipe(user, parseRecipeInput(await readJson(req)));
  return json({ recipe }, 201);
});
