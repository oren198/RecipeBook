import { and, eq } from "drizzle-orm";

import { recipeHasSubstance, type RecipeInput } from "@/domain/recipe";
import { HttpError } from "@/domain/http";
import { consumeRateLimit } from "@/server/auth/rate-limit";
import type { CurrentUser } from "@/server/auth/types";
import { getDb } from "@/server/db/client";
import { importDrafts, photos } from "@/server/db/schema";
import { htmlToText } from "@/server/import/html-text";
import { recipesFromHtml } from "@/server/import/jsonld";
import { normalizeRecipe } from "@/server/import/normalize";
import { getExtractionProvider } from "@/server/import/providers/registry";
import type { ExtractionProvider } from "@/server/import/providers/types";
import { decodeFetchedBody, safeFetch, type DnsLookup, type PinnedRequest } from "@/server/import/ssrf";
import { createImportedRecipe } from "@/server/recipes/service";
import { removeStoredFile, writeStoredFile } from "@/server/storage/files";
import { jpegForProvider, reencodeUpload } from "@/server/storage/images";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ImportDraftView = {
  id: string;
  kind: "url" | "photo";
  sourceUrl: string | null;
  photoId: string | null;
  recipe: RecipeInput;
  warnings: string[];
  extractor: string;
};

type FetchDeps = {
  lookup?: DnsLookup;
  request?: PinnedRequest;
  provider?: ExtractionProvider;
};

async function saveDraft(
  user: CurrentUser,
  draft: Omit<ImportDraftView, "id"> & { rawPayload: unknown; photoId: string | null },
): Promise<ImportDraftView> {
  const db = getDb();
  const [created] = await db
    .insert(importDrafts)
    .values({
      familyId: user.familyId,
      userId: user.id,
      kind: draft.kind,
      sourceUrl: draft.sourceUrl,
      photoId: draft.photoId,
      recipe: draft.recipe,
      warnings: draft.warnings,
      rawPayload: draft.rawPayload ?? null,
      extractor: draft.extractor,
      expiresAt: new Date(Date.now() + DAY_MS),
    })
    .returning();
  if (!created) throw new HttpError(500, "internal", "לא הצלחנו לשמור את הטיוטה.");
  if (draft.photoId) {
    await db
      .update(photos)
      .set({ draftId: created.id })
      .where(and(eq(photos.id, draft.photoId), eq(photos.familyId, user.familyId)));
  }
  return {
    id: created.id,
    kind: draft.kind,
    sourceUrl: draft.sourceUrl,
    photoId: draft.photoId,
    recipe: draft.recipe,
    warnings: draft.warnings,
    extractor: draft.extractor,
  };
}

export async function importUrl(user: CurrentUser, rawUrl: string, ip: string, deps: FetchDeps = {}): Promise<ImportDraftView> {
  await consumeRateLimit(`import:url:${user.id}`, 20, 60 * 60 * 1000);
  await consumeRateLimit(`import:url-ip:${ip}`, 30, 60 * 60 * 1000);
  const provider = deps.provider ?? getExtractionProvider();
  const fetched = await safeFetch(rawUrl, { lookup: deps.lookup, request: deps.request });
  const html = decodeFetchedBody(fetched.body, fetched.contentType);
  const found = recipesFromHtml(html);
  if (found.recipes.length > 0) {
    const normalized = normalizeRecipe(found.recipes[0]);
    const warnings = [...normalized.warnings];
    if (found.invalidBlocks > 0) warnings.push("בלוק JSON-LD אחד או יותר לא היה תקין ודולג.");
    if (found.recipes.length > 1) {
      const second = found.recipes[1] as { name?: unknown };
      const name = typeof second?.name === "string" ? second.name : "";
      warnings.push(name ? `נמצאו כמה מתכונים. מייבאים רק את הראשון, לא את «${name}».` : "נמצאו כמה מתכונים. מייבאים רק את הראשון.");
    }
    if (!recipeHasSubstance(normalized.recipe)) {
      throw new HttpError(422, "no_structured_data", "נמצא סימון מתכון ריק. לא נשמר כלום.");
    }
    normalized.recipe.sourceUrl = fetched.finalUrl;
    return saveDraft(user, {
      kind: "url",
      sourceUrl: fetched.finalUrl,
      photoId: null,
      recipe: normalized.recipe,
      warnings,
      extractor: "jsonld",
      rawPayload: found.recipes[0],
    });
  }
  if (!provider.isConfigured()) {
    throw new HttpError(
      422,
      "no_structured_data",
      "לא נמצא מתכון מובנה (schema.org). חילוץ טקסט חופשי לא מוגדר, ולא נוצר מתכון.",
    );
  }
  const text = htmlToText(html);
  const extracted = await provider.extractFromText({ url: fetched.finalUrl, text });
  extracted.recipe.sourceUrl = fetched.finalUrl;
  return saveDraft(user, {
    kind: "url",
    sourceUrl: fetched.finalUrl,
    photoId: null,
    recipe: extracted.recipe,
    warnings: ["המתכון חולץ מטקסט חופשי ולא מסימון מובנה. בדקו לפני השמירה.", ...extracted.warnings],
    extractor: provider.id,
    rawPayload: { textLength: text.length },
  });
}

export async function importPhoto(user: CurrentUser, bytes: Buffer, ip: string, provider = getExtractionProvider()): Promise<ImportDraftView> {
  await consumeRateLimit(`import:photo:${user.id}`, 10, 60 * 60 * 1000);
  await consumeRateLimit(`import:photo-ip:${ip}`, 15, 60 * 60 * 1000);
  const image = await reencodeUpload(bytes);
  if (!provider.isConfigured()) {
    throw new HttpError(409, "vision_not_configured", provider.configurationHint());
  }
  const prepared = await jpegForProvider(image.jpeg);
  const extracted = await provider.extractFromImage({ bytes: prepared, mediaType: "image/jpeg" });
  const storageKey = `${user.familyId}/${crypto.randomUUID()}.jpg`;
  await writeStoredFile(storageKey, image.jpeg);
  const db = getDb();
  let photoId: string | null = null;
  try {
    const [photo] = await db
      .insert(photos)
      .values({
        familyId: user.familyId,
        storageKey,
        contentType: "image/jpeg",
        byteSize: image.jpeg.length,
        width: image.width,
        height: image.height,
        caption: "צילום מקור",
        isSourceScan: true,
      })
      .returning({ id: photos.id });
    photoId = photo?.id ?? null;
    if (!photoId) throw new HttpError(500, "internal", "שמירת צילום המקור נכשלה.");
    return await saveDraft(user, {
      kind: "photo",
      sourceUrl: null,
      photoId,
      recipe: extracted.recipe,
      warnings: ["הטיוטה זוהתה מתמונה. בדקו כל שדה לפני השמירה. צילום המקור יישמר עם המתכון.", ...extracted.warnings],
      extractor: provider.id,
      rawPayload: { provider: provider.id, bytes: prepared.length },
    });
  } catch (error) {
    if (photoId) {
      await db.delete(photos).where(eq(photos.id, photoId));
    }
    await removeStoredFile(storageKey).catch(() => undefined);
    throw error;
  }
}

async function loadOwnedDraft(user: CurrentUser, draftId: string) {
  const db = getDb();
  const [draft] = await db
    .select()
    .from(importDrafts)
    .where(and(eq(importDrafts.id, draftId), eq(importDrafts.familyId, user.familyId), eq(importDrafts.userId, user.id)))
    .limit(1);
  if (!draft) throw new HttpError(404, "not_found", "טיוטת הייבוא לא נמצאה.");
  if (draft.expiresAt.getTime() <= Date.now()) {
    await discardDraft(user, draftId);
    throw new HttpError(410, "draft_expired", "טיוטת הייבוא פגה. צריך לייבא מחדש.");
  }
  return draft;
}

export async function readDraft(user: CurrentUser, draftId: string): Promise<ImportDraftView> {
  const draft = await loadOwnedDraft(user, draftId);
  return {
    id: draft.id,
    kind: draft.kind === "photo" ? "photo" : "url",
    sourceUrl: draft.sourceUrl,
    photoId: draft.photoId,
    recipe: draft.recipe,
    warnings: draft.warnings,
    extractor: draft.extractor,
  };
}

export async function commitDraft(user: CurrentUser, draftId: string, edited: RecipeInput) {
  const draft = await loadOwnedDraft(user, draftId);
  const recipe = await createImportedRecipe(user, edited, {
    importMethod: draft.kind === "photo" ? "photo" : "url",
    sourceUrl: edited.sourceUrl ?? draft.sourceUrl,
    photoId: draft.photoId,
    rawPayload: draft.rawPayload,
    normalizedPayload: draft.recipe,
  });
  const db = getDb();
  await db.delete(importDrafts).where(eq(importDrafts.id, draft.id));
  return recipe;
}

export async function discardDraft(user: CurrentUser, draftId: string): Promise<void> {
  const db = getDb();
  const [draft] = await db
    .select()
    .from(importDrafts)
    .where(and(eq(importDrafts.id, draftId), eq(importDrafts.familyId, user.familyId)))
    .limit(1);
  if (!draft) return;
  await db.delete(importDrafts).where(eq(importDrafts.id, draft.id));
  if (!draft.photoId) return;
  const [photo] = await db
    .select()
    .from(photos)
    .where(and(eq(photos.id, draft.photoId), eq(photos.familyId, user.familyId)))
    .limit(1);
  if (!photo || photo.recipeId) return;
  await db.delete(photos).where(eq(photos.id, photo.id));
  await removeStoredFile(photo.storageKey).catch(() => undefined);
}
