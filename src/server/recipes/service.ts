import { and, desc, eq } from "drizzle-orm";

import { parseRecipeInput, type RecipeDTO, type RecipeInput } from "@/domain/recipe";
import { HttpError } from "@/domain/http";
import type { CurrentUser } from "@/server/auth/types";
import { getDb } from "@/server/db/client";
import { importSources, photos, recipeRevisions, recipes, type RecipeSnapshot } from "@/server/db/schema";
import { removeStoredFile } from "@/server/storage/files";
import { reencodeUpload } from "@/server/storage/images";
import { writeStoredFile } from "@/server/storage/files";
import { EXAMPLE_RECIPES } from "@/server/seed/examples";
import {
  getRecipe,
  insertRecipe,
  listIndex,
  replaceRecipeContent,
  setFavorite,
  snapshotOf,
} from "@/server/recipes/repository";

const MAX_PHOTOS = 8;

async function requireRecipe(user: CurrentUser, recipeId: string): Promise<RecipeDTO> {
  const recipe = await getRecipe(user.familyId, user.id, recipeId);
  if (!recipe) throw new HttpError(404, "not_found", "המתכון לא נמצא.");
  return recipe;
}

async function remember(user: CurrentUser, recipe: RecipeDTO, summary: string): Promise<void> {
  const db = getDb();
  await db.insert(recipeRevisions).values({
    recipeId: recipe.id,
    familyId: user.familyId,
    userId: user.id,
    summary,
    snapshot: snapshotOf(recipe),
  });
}

export async function listRecipes(user: CurrentUser, filter: { q?: string; category?: string | null; favorite?: boolean; tag?: string | null }) {
  return listIndex(user.familyId, user.id, filter);
}

export async function readRecipe(user: CurrentUser, recipeId: string) {
  return requireRecipe(user, recipeId);
}

export async function insertExamples(user: CurrentUser): Promise<number> {
  const current = await listIndex(user.familyId, user.id, {});
  const have = new Set(current.filter((recipe) => recipe.isExample).map((recipe) => recipe.title));
  const db = getDb();
  let added = 0;
  for (const example of EXAMPLE_RECIPES) {
    if (have.has(example.title)) continue;
    const id = await db.transaction(async (tx) =>
      insertRecipe(tx, user.familyId, user.id, example, { importMethod: "seed", isExample: true }),
    );
    const saved = await requireRecipe(user, id);
    await remember(user, saved, "נוצר כדוגמה");
    added += 1;
  }
  return added;
}

export async function createManualRecipe(user: CurrentUser, input: RecipeInput): Promise<RecipeDTO> {
  const db = getDb();
  const id = await db.transaction(async (tx) => insertRecipe(tx, user.familyId, user.id, input, { importMethod: "manual", isExample: false }));
  const recipe = await requireRecipe(user, id);
  await remember(user, recipe, "נוצר");
  return recipe;
}

export async function createImportedRecipe(
  user: CurrentUser,
  input: RecipeInput,
  meta: {
    importMethod: "url" | "photo";
    sourceUrl: string | null;
    photoId: string | null;
    rawPayload: unknown;
    normalizedPayload: unknown;
  },
): Promise<RecipeDTO> {
  const db = getDb();
  const id = await db.transaction(async (tx) => {
    const recipeId = await insertRecipe(tx, user.familyId, user.id, input, { importMethod: meta.importMethod, isExample: false });
    await tx.insert(importSources).values({
      recipeId,
      familyId: user.familyId,
      kind: meta.importMethod,
      sourceUrl: meta.sourceUrl,
      photoId: meta.photoId,
      rawPayload: meta.rawPayload ?? null,
      normalizedPayload: meta.normalizedPayload ?? input,
    });
    if (meta.photoId) {
      await tx
        .update(photos)
        .set({ recipeId, draftId: null })
        .where(and(eq(photos.id, meta.photoId), eq(photos.familyId, user.familyId)));
    }
    return recipeId;
  });
  const recipe = await requireRecipe(user, id);
  await remember(user, recipe, "נוצר מייבוא");
  return recipe;
}

export async function updateRecipe(user: CurrentUser, recipeId: string, input: RecipeInput): Promise<RecipeDTO> {
  const current = await requireRecipe(user, recipeId);
  await remember(user, current, "לפני עריכה");
  const db = getDb();
  await db.transaction(async (tx) => {
    await replaceRecipeContent(tx, user.familyId, user.id, recipeId, input);
  });
  return requireRecipe(user, recipeId);
}

export async function updateNotes(user: CurrentUser, recipeId: string, notes: string | null): Promise<RecipeDTO> {
  const current = await requireRecipe(user, recipeId);
  await remember(user, current, "לפני עדכון הערה");
  const db = getDb();
  await db
    .update(recipes)
    .set({ notes, updatedAt: new Date(), updatedBy: user.id })
    .where(and(eq(recipes.id, recipeId), eq(recipes.familyId, user.familyId)));
  return requireRecipe(user, recipeId);
}

export async function toggleFavorite(user: CurrentUser, recipeId: string, favorite: boolean): Promise<RecipeDTO> {
  await requireRecipe(user, recipeId);
  await setFavorite(user.id, recipeId, favorite);
  return requireRecipe(user, recipeId);
}

export async function removeRecipe(user: CurrentUser, recipeId: string): Promise<void> {
  await requireRecipe(user, recipeId);
  const db = getDb();
  const files = await db
    .select({ storageKey: photos.storageKey })
    .from(photos)
    .where(and(eq(photos.recipeId, recipeId), eq(photos.familyId, user.familyId)));
  await db.delete(recipes).where(and(eq(recipes.id, recipeId), eq(recipes.familyId, user.familyId)));
  await Promise.all(files.map((file) => removeStoredFile(file.storageKey).catch(() => undefined)));
}

export async function listRevisions(user: CurrentUser, recipeId: string) {
  await requireRecipe(user, recipeId);
  const db = getDb();
  const rows = await db
    .select({
      id: recipeRevisions.id,
      summary: recipeRevisions.summary,
      createdAt: recipeRevisions.createdAt,
    })
    .from(recipeRevisions)
    .where(and(eq(recipeRevisions.recipeId, recipeId), eq(recipeRevisions.familyId, user.familyId)))
    .orderBy(desc(recipeRevisions.createdAt));
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function restoreRevision(user: CurrentUser, recipeId: string, revisionId: string): Promise<RecipeDTO> {
  const current = await requireRecipe(user, recipeId);
  const db = getDb();
  const [revision] = await db
    .select()
    .from(recipeRevisions)
    .where(and(eq(recipeRevisions.id, revisionId), eq(recipeRevisions.recipeId, recipeId), eq(recipeRevisions.familyId, user.familyId)))
    .limit(1);
  if (!revision) throw new HttpError(404, "not_found", "הגרסה לא נמצאה.");
  const restored = parseRecipeInput(revision.snapshot);
  await remember(user, current, "לפני שחזור");
  await db.transaction(async (tx) => {
    await replaceRecipeContent(tx, user.familyId, user.id, recipeId, restored);
  });
  return requireRecipe(user, recipeId);
}

export async function addRecipePhoto(user: CurrentUser, recipeId: string, bytes: Buffer, caption: string | null): Promise<RecipeDTO> {
  const recipe = await requireRecipe(user, recipeId);
  if (recipe.photos.length >= MAX_PHOTOS) {
    throw new HttpError(400, "too_many_photos", "אפשר עד 8 תמונות למתכון.");
  }
  const image = await reencodeUpload(bytes);
  const storageKey = `${user.familyId}/${crypto.randomUUID()}.jpg`;
  await writeStoredFile(storageKey, image.jpeg);
  try {
    const db = getDb();
    await db.insert(photos).values({
      familyId: user.familyId,
      recipeId,
      storageKey,
      contentType: "image/jpeg",
      byteSize: image.jpeg.length,
      width: image.width,
      height: image.height,
      caption,
      isSourceScan: false,
    });
  } catch (error) {
    await removeStoredFile(storageKey);
    throw error;
  }
  return requireRecipe(user, recipeId);
}

export async function readPhoto(user: CurrentUser, photoId: string): Promise<{ bytes: Buffer; contentType: string }> {
  const db = getDb();
  const [photo] = await db
    .select()
    .from(photos)
    .where(and(eq(photos.id, photoId), eq(photos.familyId, user.familyId)))
    .limit(1);
  if (!photo) throw new HttpError(404, "not_found", "התמונה לא נמצאה.");
  try {
    const bytes = await (await import("@/server/storage/files")).readStoredFile(photo.storageKey);
    return { bytes, contentType: photo.contentType };
  } catch {
    throw new HttpError(404, "not_found", "התמונה לא נמצאה.");
  }
}

export async function removePhoto(user: CurrentUser, photoId: string): Promise<void> {
  const db = getDb();
  const [photo] = await db
    .select()
    .from(photos)
    .where(and(eq(photos.id, photoId), eq(photos.familyId, user.familyId)))
    .limit(1);
  if (!photo) throw new HttpError(404, "not_found", "התמונה לא נמצאה.");
  await db.delete(photos).where(eq(photos.id, photo.id));
  await removeStoredFile(photo.storageKey).catch(() => undefined);
}

export function snapshotFromRecipe(recipe: RecipeDTO): RecipeSnapshot {
  return snapshotOf(recipe);
}
