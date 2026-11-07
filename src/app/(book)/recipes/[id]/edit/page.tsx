import { notFound } from "next/navigation";

import { RecipeForm } from "@/components/book/recipe-form";
import type { RecipeDTO } from "@/domain/recipe";
import { getCurrentUser } from "@/server/auth/current";
import { isUuid } from "@/server/http";
import { readRecipe } from "@/server/recipes/service";

export const dynamic = "force-dynamic";

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  let recipe: RecipeDTO | null = null;
  try {
    recipe = await readRecipe(user, id);
  } catch {
    recipe = null;
  }
  if (!recipe) notFound();
  return <RecipeForm initial={recipe} recipeId={recipe.id} heading="עריכת מתכון" submitLabel="שמירה בספר" />;
}
