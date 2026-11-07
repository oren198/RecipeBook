import Link from "next/link";
import { notFound } from "next/navigation";

import { RestoreButton } from "@/components/book/restore-button";
import type { RecipeDTO } from "@/domain/recipe";
import { getCurrentUser } from "@/server/auth/current";
import { isUuid } from "@/server/http";
import { listRevisions, readRecipe } from "@/server/recipes/service";

export const dynamic = "force-dynamic";

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  let recipe: RecipeDTO | null = null;
  let revisions: { id: string; summary: string; createdAt: string }[] = [];
  try {
    recipe = await readRecipe(user, id);
    revisions = await listRevisions(user, id);
  } catch {
    recipe = null;
  }
  if (!recipe) notFound();
  return (
      <article className="desk-sheet">
      <p className="kicker">גרסאות</p>
      <h1 dir="auto">{recipe.title}</h1>
      <p className="lede">לפני כל עריכה נשמר עותק. שחזור מחזיר את הטקסט, ושומר את המצב הנוכחי כגרסה נוספת. מקור הייבוא לא נמחק.</p>
      {revisions.length === 0 ? <p>עדיין אין גרסאות.</p> : null}
      <ul className="toc">
        {revisions.map((revision) => (
          <li key={revision.id}>
            <span>
              {revision.summary} · {new Date(revision.createdAt).toLocaleString("he-IL")}
            </span>
            <RestoreButton recipeId={id} revisionId={revision.id} />
          </li>
        ))}
      </ul>
      <Link className="button secondary" href={`/recipes/${id}`}>
        חזרה למתכון
      </Link>
    </article>
  );
}
