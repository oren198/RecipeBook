import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { IndexRecipe, RecipeDTO, RecipeInput } from "@/domain/recipe";
import { getDb } from "@/server/db/client";
import {
  favorites,
  ingredientGroups,
  ingredients,
  instructionGroups,
  photos,
  recipes,
  steps,
  type RecipeSnapshot,
} from "@/server/db/schema";

type Executor = Pick<ReturnType<typeof getDb>, "select" | "insert" | "update" | "delete">;

function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export async function listIndex(
  familyId: string,
  userId: string,
  filter: { q?: string; category?: string | null; favorite?: boolean; tag?: string | null },
): Promise<IndexRecipe[]> {
  const db = getDb();
  const filters = [eq(recipes.familyId, familyId)];
  if (filter.category) filters.push(eq(recipes.category, filter.category));
  if (filter.favorite) {
    filters.push(sql`exists (select 1 from favorites f where f.recipe_id = ${recipes.id} and f.user_id = ${userId})`);
  }
  if (filter.tag) {
    filters.push(sql`exists (select 1 from unnest(${recipes.tags}) as tag where tag = ${filter.tag})`);
  }
  const q = filter.q?.trim() ?? "";
  if (q) {
    const pattern = likePattern(q);
    filters.push(sql`(
      ${recipes.title} ilike ${pattern} escape '\\'
      or coalesce(${recipes.intro}, '') ilike ${pattern} escape '\\'
      or coalesce(${recipes.notes}, '') ilike ${pattern} escape '\\'
      or coalesce(${recipes.category}, '') ilike ${pattern} escape '\\'
      or exists (select 1 from unnest(${recipes.tags}) as tag where tag ilike ${pattern} escape '\\')
      or exists (
        select 1 from ingredient_groups g
        join ingredients i on i.group_id = g.id
        where g.recipe_id = ${recipes.id}
          and (i.item ilike ${pattern} escape '\\' or coalesce(i.note, '') ilike ${pattern} escape '\\')
      )
      or exists (
        select 1 from instruction_groups sg
        join steps st on st.group_id = sg.id
        where sg.recipe_id = ${recipes.id}
          and st.text ilike ${pattern} escape '\\'
      )
    )`);
  }
  const rows = await db
    .select({
      id: recipes.id,
      title: recipes.title,
      category: recipes.category,
      tags: recipes.tags,
      intro: recipes.intro,
      servingsText: recipes.servingsText,
      prepMinutes: recipes.prepMinutes,
      cookMinutes: recipes.cookMinutes,
      isExample: recipes.isExample,
      updatedAt: recipes.updatedAt,
      isFavorite: sql<boolean>`exists (select 1 from favorites f where f.recipe_id = ${recipes.id} and f.user_id = ${userId})`,
    })
    .from(recipes)
    .where(and(...filters));
  return rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      tags: row.tags ?? [],
      intro: row.intro,
      servingsText: row.servingsText,
      prepMinutes: row.prepMinutes,
      cookMinutes: row.cookMinutes,
      isExample: row.isExample,
      isFavorite: Boolean(row.isFavorite),
      updatedAt: row.updatedAt.toISOString(),
    }))
    .sort((a, b) => {
      const category = (a.category ?? "תתת").localeCompare(b.category ?? "תתת", "he");
      if (category !== 0) return category;
      return a.title.localeCompare(b.title, "he");
    });
}

export async function getRecipe(familyId: string, userId: string, recipeId: string): Promise<RecipeDTO | null> {
  const db = getDb();
  return loadRecipe(db, familyId, userId, recipeId);
}

async function loadRecipe(db: Executor, familyId: string, userId: string, recipeId: string): Promise<RecipeDTO | null> {
  const [recipe] = await db.select().from(recipes).where(and(eq(recipes.id, recipeId), eq(recipes.familyId, familyId))).limit(1);
  if (!recipe) return null;
  const groups = await db
    .select()
    .from(ingredientGroups)
    .where(eq(ingredientGroups.recipeId, recipeId))
    .orderBy(asc(ingredientGroups.position));
  const groupIds = groups.map((group) => group.id);
  const items = groupIds.length
    ? await db.select().from(ingredients).where(inArray(ingredients.groupId, groupIds)).orderBy(asc(ingredients.position))
    : [];
  const sections = await db
    .select()
    .from(instructionGroups)
    .where(eq(instructionGroups.recipeId, recipeId))
    .orderBy(asc(instructionGroups.position));
  const sectionIds = sections.map((section) => section.id);
  const stepRows = sectionIds.length
    ? await db.select().from(steps).where(inArray(steps.groupId, sectionIds)).orderBy(asc(steps.position))
    : [];
  const photoRows = await db.select().from(photos).where(eq(photos.recipeId, recipeId)).orderBy(asc(photos.createdAt));
  const [favorite] = await db
    .select({ recipeId: favorites.recipeId })
    .from(favorites)
    .where(and(eq(favorites.recipeId, recipeId), eq(favorites.userId, userId)))
    .limit(1);
  return {
    id: recipe.id,
    title: recipe.title,
    intro: recipe.intro,
    servings: recipe.servings,
    servingsText: recipe.servingsText,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    category: recipe.category,
    tags: recipe.tags ?? [],
    notes: recipe.notes,
    sourceName: recipe.sourceName,
    sourceUrl: recipe.sourceUrl,
    importMethod: recipe.importMethod as RecipeDTO["importMethod"],
    isExample: recipe.isExample,
    isFavorite: Boolean(favorite),
    photos: photoRows.map((photo) => ({
      id: photo.id,
      caption: photo.caption,
      isSourceScan: photo.isSourceScan,
      width: photo.width,
      height: photo.height,
    })),
    createdAt: recipe.createdAt.toISOString(),
    updatedAt: recipe.updatedAt.toISOString(),
    ingredientGroups: groups.map((group) => ({
      title: group.title,
      items: items
        .filter((item) => item.groupId === group.id)
        .map((item) => ({
          amount: item.amount,
          amountMax: item.amountMax,
          unit: item.unit,
          item: item.item,
          note: item.note,
          optional: item.optional,
        })),
    })),
    instructionGroups: sections.map((section) => ({
      title: section.title,
      steps: stepRows.filter((step) => step.groupId === section.id).map((step) => ({ text: step.text })),
    })),
  };
}

export function snapshotOf(recipe: RecipeDTO): RecipeSnapshot {
  return {
    title: recipe.title,
    intro: recipe.intro,
    servings: recipe.servings,
    servingsText: recipe.servingsText,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    category: recipe.category,
    tags: recipe.tags,
    notes: recipe.notes,
    sourceName: recipe.sourceName,
    sourceUrl: recipe.sourceUrl,
    ingredientGroups: recipe.ingredientGroups,
    instructionGroups: recipe.instructionGroups,
    importMethod: recipe.importMethod,
    isExample: recipe.isExample,
    sourcePhotoIds: recipe.photos.map((photo) => photo.id),
  };
}

export async function insertRecipe(
  db: Executor,
  familyId: string,
  userId: string,
  input: RecipeInput,
  meta: { importMethod: RecipeDTO["importMethod"]; isExample: boolean },
): Promise<string> {
  const [created] = await db
    .insert(recipes)
    .values({
      familyId,
      title: input.title,
      intro: input.intro,
      servings: input.servings,
      servingsText: input.servingsText,
      prepMinutes: input.prepMinutes,
      cookMinutes: input.cookMinutes,
      category: input.category,
      tags: input.tags,
      notes: input.notes,
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      importMethod: meta.importMethod,
      isExample: meta.isExample,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning({ id: recipes.id });
  if (!created) throw new Error("recipe insert failed");
  await replaceStructure(db, created.id, input);
  return created.id;
}

export async function replaceRecipeContent(db: Executor, familyId: string, userId: string, recipeId: string, input: RecipeInput): Promise<void> {
  await db.delete(ingredientGroups).where(eq(ingredientGroups.recipeId, recipeId));
  await db.delete(instructionGroups).where(eq(instructionGroups.recipeId, recipeId));
  await db
    .update(recipes)
    .set({
      title: input.title,
      intro: input.intro,
      servings: input.servings,
      servingsText: input.servingsText,
      prepMinutes: input.prepMinutes,
      cookMinutes: input.cookMinutes,
      category: input.category,
      tags: input.tags,
      notes: input.notes,
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(and(eq(recipes.id, recipeId), eq(recipes.familyId, familyId)));
  await replaceStructure(db, recipeId, input);
}

async function replaceStructure(db: Executor, recipeId: string, input: RecipeInput): Promise<void> {
  for (const [groupIndex, group] of input.ingredientGroups.entries()) {
    const [created] = await db
      .insert(ingredientGroups)
      .values({ recipeId, position: groupIndex, title: group.title })
      .returning({ id: ingredientGroups.id });
    if (!created || group.items.length === 0) continue;
    await db.insert(ingredients).values(
      group.items.map((item, position) => ({
        groupId: created.id,
        position,
        amount: item.amount,
        amountMax: item.amountMax,
        unit: item.unit,
        item: item.item,
        note: item.note,
        optional: item.optional,
      })),
    );
  }
  for (const [groupIndex, group] of input.instructionGroups.entries()) {
    const [created] = await db
      .insert(instructionGroups)
      .values({ recipeId, position: groupIndex, title: group.title })
      .returning({ id: instructionGroups.id });
    if (!created || group.steps.length === 0) continue;
    await db.insert(steps).values(group.steps.map((step, position) => ({ groupId: created.id, position, text: step.text })));
  }
}

export async function setFavorite(userId: string, recipeId: string, favorite: boolean): Promise<void> {
  const db = getDb();
  if (favorite) {
    await db.insert(favorites).values({ userId, recipeId }).onConflictDoNothing();
    return;
  }
  await db.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.recipeId, recipeId)));
}
