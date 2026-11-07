import { RecipeForm } from "@/components/book/recipe-form";

export const dynamic = "force-dynamic";

export default function NewRecipePage() {
  return <RecipeForm heading="מתכון חדש" submitLabel="שמירה בספר" />;
}
