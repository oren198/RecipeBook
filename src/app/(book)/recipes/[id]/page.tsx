import { notFound } from "next/navigation";

import { RecipeSpread } from "@/components/book/recipe-spread";
import type { RecipeDTO } from "@/domain/recipe";
import { getCurrentUser } from "@/server/auth/current";
import { isUuid } from "@/server/http";
import { listRecipes, readRecipe } from "@/server/recipes/service";

export const dynamic = "force-dynamic";

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  let recipe: RecipeDTO | null = null;
  let previous: { id: string; title: string } | null = null;
  let next: { id: string; title: string } | null = null;
  try {
    recipe = await readRecipe(user, id);
    const index = await listRecipes(user, {});
    const position = index.findIndex((item) => item.id === id);
    const previousItem = position > 0 ? index[position - 1] : null;
    const nextItem = position >= 0 && position < index.length - 1 ? index[position + 1] : null;
    previous = previousItem ? { id: previousItem.id, title: previousItem.title } : null;
    next = nextItem ? { id: nextItem.id, title: nextItem.title } : null;
  } catch {
    recipe = null;
  }
  if (!recipe) notFound();
  return <RecipeSpread recipe={recipe} previous={previous} next={next} />;
}
