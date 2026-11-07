import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";

import { POST as setup } from "@/app/api/auth/setup/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as listRecipesRoute } from "@/app/api/recipes/route";
import { PATCH as updateRecipeRoute, GET as getRecipeRoute } from "@/app/api/recipes/[id]/route";
import { PATCH as notesRoute } from "@/app/api/recipes/[id]/notes/route";
import { GET as revisionsRoute } from "@/app/api/recipes/[id]/revisions/route";
import { POST as restoreRoute } from "@/app/api/recipes/[id]/restore/route";
import { GET as photoRoute } from "@/app/api/photos/[id]/route";
import { GET as meRoute } from "@/app/api/auth/me/route";
import { POST as examplesRoute } from "@/app/api/examples/route";
import { bootstrapFamily } from "@/server/auth/service";
import { getDb } from "@/server/db/client";
import { importSources, photos, recipes } from "@/server/db/schema";
import { importPhoto, importUrl } from "@/server/import/service";
import type { ExtractionProvider } from "@/server/import/providers/types";
import { addRecipePhoto, createManualRecipe } from "@/server/recipes/service";
import { eq } from "drizzle-orm";

import { familyCount, originHeaders, recipeCountFor, resetDatabase } from "./helpers";

const ctx = { params: Promise.resolve({}) };

function jsonRequest(path: string, body: unknown, cookie?: string, method = "POST") {
  return new Request(`http://127.0.0.1:43123${path}`, {
    method,
    headers: originHeaders(cookie),
    body: JSON.stringify(body),
  });
}

function cookieFrom(response: Response): string {
  const header = response.headers.get("set-cookie") ?? "";
  return header.split(";")[0] ?? "";
}

async function setupFamily(username = "family") {
  const response = await setup(
    jsonRequest("/api/auth/setup", {
      familyName: "ספר לדוגמה",
      username,
      password: "local-test-password",
    }),
    ctx,
  );
  expect(response.status).toBe(201);
  return cookieFrom(response);
}

beforeEach(async () => {
  await resetDatabase();
});

describe("auth enforcement", () => {
  it("creates one family, then closes setup and requires a session", async () => {
    const cookie = await setupFamily();
    const again = await setup(
      jsonRequest("/api/auth/setup", { familyName: "אחר", username: "other", password: "local-test-password" }),
      ctx,
    );
    expect(again.status).toBe(409);
    expect(await familyCount()).toBe(1);

    const anonymous = await listRecipesRoute(new Request("http://127.0.0.1:43123/api/recipes"), ctx);
    expect(anonymous.status).toBe(401);
    const me = await meRoute(new Request("http://127.0.0.1:43123/api/auth/me", { headers: { cookie } }), ctx);
    expect(me.status).toBe(200);

    const badOrigin = await login(
      new Request("http://127.0.0.1:43123/api/auth/login", {
        method: "POST",
        headers: { origin: "https://evil.example", host: "127.0.0.1:43123", "content-type": "application/json" },
        body: JSON.stringify({ username: "family", password: "local-test-password" }),
      }),
      ctx,
    );
    expect(badOrigin.status).toBe(403);

    const wrong = await login(jsonRequest("/api/auth/login", { username: "family", password: "not-the-password" }), ctx);
    expect(wrong.status).toBe(401);
    const right = await login(jsonRequest("/api/auth/login", { username: "family", password: "local-test-password" }), ctx);
    expect(right.status).toBe(200);
  });

  it("lets only one of two simultaneous setups win", async () => {
    const results = await Promise.allSettled([
      bootstrapFamily({ familyName: "בית א", username: "alpha", password: "local-test-password", setupSecret: null, ip: "a" }),
      bootstrapFamily({ familyName: "בית ב", username: "beta", password: "local-test-password", setupSecret: null, ip: "b" }),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    expect(await familyCount()).toBe(1);
  });

  it("rate limits repeated logins", async () => {
    await setupFamily();
    let limited = false;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await login(jsonRequest("/api/auth/login", { username: "family", password: "wrong-password" }), ctx);
      if (response.status === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });

  it("hides another family's recipe and photo", async () => {
    const cookie = await setupFamily();
    const me = await meRoute(new Request("http://127.0.0.1:43123/api/auth/me", { headers: { cookie } }), ctx);
    const user = (await me.json()) as { user: { id: string; familyId: string; familyName: string; username: string; displayName: string } };
    const recipe = await createManualRecipe(user.user, {
      title: "מרק לדוגמה",
      intro: null,
      servings: 2,
      servingsText: "2 מנות",
      prepMinutes: 5,
      cookMinutes: null,
      category: "דוגמה",
      tags: [],
      notes: null,
      sourceName: null,
      sourceUrl: null,
      ingredientGroups: [{ title: null, items: [{ amount: 1, amountMax: null, unit: null, item: "מים", note: null, optional: false }] }],
      instructionGroups: [{ title: null, steps: [{ text: "להרתיח" }] }],
    });
    const jpeg = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#b55233" } }).jpeg().toBuffer();
    const withPhoto = await addRecipePhoto(user.user, recipe.id, jpeg, null);
    const photoId = withPhoto.photos[0]?.id;
    expect(photoId).toBeTruthy();

    const { insertSecondFamily } = await import("./helpers");
    const other = await insertSecondFamily();
    const otherCookie = await login(jsonRequest("/api/auth/login", { username: "other-house", password: "another-house-password" }), ctx);
    expect(otherCookie.status).toBe(200);
    const hidden = await getRecipeRoute(new Request("http://127.0.0.1:43123/api/recipes/" + recipe.id, { headers: { cookie: cookieFrom(otherCookie) } }), {
      params: Promise.resolve({ id: recipe.id }),
    });
    expect(hidden.status).toBe(404);
    const hiddenPhoto = await photoRoute(
      new Request(`http://127.0.0.1:43123/api/photos/${photoId}`, { headers: { cookie: cookieFrom(otherCookie) } }),
      { params: Promise.resolve({ id: photoId ?? "" }) },
    );
    expect(hiddenPhoto.status).toBe(404);
    const anonymousPhoto = await photoRoute(new Request(`http://127.0.0.1:43123/api/photos/${photoId}`), {
      params: Promise.resolve({ id: photoId ?? "" }),
    });
    expect(anonymousPhoto.status).toBe(401);
    const ownPhoto = await photoRoute(new Request(`http://127.0.0.1:43123/api/photos/${photoId}`, { headers: { cookie } }), {
      params: Promise.resolve({ id: photoId ?? "" }),
    });
    expect(ownPhoto.status).toBe(200);
    expect(ownPhoto.headers.get("content-type")).toBe("image/jpeg");
    expect(ownPhoto.headers.get("cache-control")).toContain("no-store");
    expect(other.familyId).not.toBe(user.user.familyId);
  });
});

describe("recipe edits and imports", () => {
  it("persists notes, revisions, and restore", async () => {
    const cookie = await setupFamily("cook");
    const created = await examplesRoute(jsonRequest("/api/examples", {}, cookie), ctx);
    expect(created.status).toBe(200);
    const listed = await listRecipesRoute(new Request("http://127.0.0.1:43123/api/recipes", { headers: { cookie } }), ctx);
    const body = (await listed.json()) as { recipes: { id: string; title: string; isExample: boolean }[] };
    const recipe = body.recipes[0];
    expect(recipe?.isExample).toBe(true);
    const noted = await notesRoute(jsonRequest(`/api/recipes/${recipe?.id}/notes`, { notes: "הערת בדיקה" }, cookie, "PATCH"), {
      params: Promise.resolve({ id: recipe?.id ?? "" }),
    });
    expect(noted.status).toBe(200);
    const edited = await updateRecipeRoute(
      jsonRequest(
        `/api/recipes/${recipe?.id}`,
        {
          title: "אחרי עריכה",
          intro: null,
          servings: null,
          servingsText: null,
          prepMinutes: null,
          cookMinutes: null,
          category: "דוגמה",
          tags: ["דוגמה"],
          notes: "הערת בדיקה",
          sourceName: "נתוני דוגמה",
          sourceUrl: null,
          ingredientGroups: [],
          instructionGroups: [],
        },
        cookie,
        "PATCH",
      ),
      { params: Promise.resolve({ id: recipe?.id ?? "" }) },
    );
    expect(edited.status).toBe(200);
    const revisions = await revisionsRoute(new Request(`http://127.0.0.1:43123/api/recipes/${recipe?.id}/revisions`, { headers: { cookie } }), {
      params: Promise.resolve({ id: recipe?.id ?? "" }),
    });
    const revisionBody = (await revisions.json()) as { revisions: { id: string; summary: string }[] };
    const beforeEdit = revisionBody.revisions.find((revision) => revision.summary === "לפני עריכה");
    expect(beforeEdit).toBeTruthy();
    const restored = await restoreRoute(
      jsonRequest(`/api/recipes/${recipe?.id}/restore`, { revisionId: beforeEdit?.id }, cookie),
      { params: Promise.resolve({ id: recipe?.id ?? "" }) },
    );
    expect(restored.status).toBe(200);
    const after = (await restored.json()) as { recipe: { title: string; notes: string | null } };
    expect(after.recipe.title).not.toBe("אחרי עריכה");
    expect(after.recipe.notes).toBe("הערת בדיקה");
  });

  it("keeps json-ld import as a draft, then preserves the raw source after an edit", async () => {
    const cookie = await setupFamily("importer");
    const me = await meRoute(new Request("http://127.0.0.1:43123/api/auth/me", { headers: { cookie } }), ctx);
    const { user } = (await me.json()) as { user: { id: string; familyId: string; familyName: string; username: string; displayName: string } };
    const provider: ExtractionProvider = {
      id: "openrouter",
      isConfigured: () => true,
      configurationHint: () => "configured",
      extractFromText: async () => {
        throw new Error("provider should not run");
      },
      extractFromImage: async () => {
        throw new Error("provider should not run");
      },
    };
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite"},{"@type":"Recipe","name":"מרק לדוגמה","recipeIngredient":["2 כוסות מים"],"recipeInstructions":"להרתיח"}]}</script>`;
    const draft = await importUrl(user, "https://recipes.example/soup", "direct", {
      provider,
      lookup: async () => [{ address: "1.1.1.1", family: 4 }],
      request: async () => ({ status: 200, headers: { get: () => "text/html" }, body: Buffer.from(html) }),
    });
    expect(draft.extractor).toBe("jsonld");
    expect(draft.recipe.title).toBe("מרק לדוגמה");
    expect(await recipeCountFor(user.familyId)).toBe(0);
    const { commitDraft } = await import("@/server/import/service");
    const saved = await commitDraft(user, draft.id, { ...draft.recipe, title: "מרק אחרי בדיקה" });
    expect(saved.title).toBe("מרק אחרי בדיקה");
    const db = getDb();
    const [source] = await db.select().from(importSources).where(eq(importSources.recipeId, saved.id));
    expect((source?.rawPayload as { name?: string }).name).toBe("מרק לדוגמה");
    expect((source?.normalizedPayload as { title?: string }).title).toBe("מרק לדוגמה");

    await expect(
      importUrl(user, "https://recipes.example/plain", "direct", {
        lookup: async () => [{ address: "1.1.1.1", family: 4 }],
        request: async () => ({ status: 200, headers: { get: () => "text/html" }, body: Buffer.from("<p>no recipe</p>") }),
      }),
    ).rejects.toMatchObject({ code: "no_structured_data" });

    await expect(importUrl(user, "http://127.0.0.1/secret", "direct", {})).rejects.toMatchObject({ code: "private_address" });
    const rows = await db.select().from(recipes).where(eq(recipes.familyId, user.familyId));
    expect(rows).toHaveLength(1);
  });

  it("does not save a photo or a recipe when vision is not configured", async () => {
    const cookie = await setupFamily("scanner");
    const me = await meRoute(new Request("http://127.0.0.1:43123/api/auth/me", { headers: { cookie } }), ctx);
    const { user } = (await me.json()) as { user: { id: string; familyId: string; familyName: string; username: string; displayName: string } };
    const jpeg = await sharp({ create: { width: 12, height: 12, channels: 3, background: "#5d6b46" } }).jpeg().toBuffer();
    await expect(importPhoto(user, jpeg, "direct")).rejects.toMatchObject({ code: "vision_not_configured" });
    const db = getDb();
    expect(await db.select().from(photos)).toEqual([]);
    expect(await recipeCountFor(user.familyId)).toBe(0);
  });
});
