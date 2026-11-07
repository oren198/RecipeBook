import { IndexSpread } from "@/components/book/index-spread";
import { getCurrentUser } from "@/server/auth/current";
import { listRecipes } from "@/server/recipes/service";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FavoritesPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const recipes = await listRecipes(user, {
    q: params.q ?? "",
    category: params.category ?? null,
    favorite: true,
  });
  return (
    <IndexSpread familyName={user.familyName} recipes={recipes} query={params.q ?? ""} category={params.category ?? null} favoriteOnly />
  );
}
