import { mkdir } from "node:fs/promises";
import path from "node:path";

import postgres from "postgres";
import { expect, test, type Page } from "@playwright/test";

const password = "e2e-demo-pass-not-a-secret";

async function shot(page: Page, name: string) {
  const dir = process.env.E2E_SCREENSHOT_DIR;
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
}

async function sampleCurl(page: Page, onFrame?: (turn: number | null) => Promise<void>) {
  const samples: { turn: number | null; hinge: string | null; wing: string | null }[] = [];
  for (let frame = 0; frame < 7; frame += 1) {
    const sample = await page.evaluate(() => {
      const curl = document.querySelector("[data-curl]");
      const hinge = document.querySelector("[data-hinge]");
      const wing = document.querySelector("[data-wing]");
      return {
        turn: curl ? Number(curl.getAttribute("data-turn")) : null,
        hinge: hinge ? getComputedStyle(hinge).transform : null,
        wing: wing ? getComputedStyle(wing).transform : null,
      };
    });
    samples.push(sample);
    if (onFrame) await onFrame(sample.turn);
    await page.waitForTimeout(130);
  }
  const turns = samples.map((sample) => sample.turn).filter((turn): turn is number => turn != null);
  expect(turns.length).toBeGreaterThan(3);
  expect(turns[0] ?? 1).toBeLessThan(0.5);
  expect(turns[turns.length - 1] ?? 0).toBeGreaterThan(0.5);
  for (let index = 1; index < turns.length; index += 1) {
    expect(turns[index]).toBeGreaterThanOrEqual((turns[index - 1] ?? 0) - 0.02);
  }
  const mid = samples.find((sample) => sample.turn != null && sample.turn > 0.2 && sample.turn < 0.85);
  expect(mid?.hinge && mid.hinge !== "none").toBeTruthy();
  expect(mid?.wing && mid.wing !== "none" && mid.wing !== mid.hinge).toBeTruthy();
  return samples;
}

test.beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const host = new URL(databaseUrl).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error("e2e reset refuses non-local databases");
  }
  const ready = await fetch("http://127.0.0.1:43123/api/ready");
  if (!ready.ok) throw new Error("database is not ready");
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  await sql`truncate table families, rate_limits restart identity cascade`;
  await sql.end();
});

test("login, example book, edit, notes, rtl and mobile", async ({ page }) => {
  await page.goto("/setup");
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByLabel("שם הספר").fill("ספר לדוגמה");
  await page.getByLabel("שם משתמש").fill("demo");
  await page.getByLabel("סיסמה").fill(password);
  await page.getByRole("button", { name: "יצירת הספר" }).click();
  await expect(page.getByRole("heading", { name: "ספר לדוגמה" })).toBeVisible();
  await shot(page, "screenshot_book_cover");
  await page.getByRole("button", { name: "פתיחת הספר" }).click();
  await page.getByRole("button", { name: "טעינת מתכוני דוגמה" }).click();
  await expect(page.getByRole("link", { name: /שקשוקה לדוגמה/ })).toBeVisible();

  await page.getByRole("link", { name: /שקשוקה לדוגמה/ }).click();
  await expect(page.getByText("מתכון לדוגמה")).toBeVisible();
  const titleBox = await page.locator("[data-page='title']").boundingBox();
  const methodBox = await page.locator("[data-page='method']").boundingBox();
  expect(titleBox && methodBox).toBeTruthy();
  expect(titleBox!.x).toBeGreaterThan((methodBox?.x ?? 0) + 40);
  await shot(page, "screenshot_turn_before");
  const beforeText = await page.locator("[data-page='title']").innerText();
  await page.locator(".turn-word", { hasText: "העמוד הבא" }).click();
  let midShot = false;
  const samples = await sampleCurl(page, async (turn) => {
    if (!midShot && turn != null && turn > 0.28 && turn < 0.72) {
      await shot(page, "screenshot_turn_mid");
      midShot = true;
    }
  });
  expect(midShot).toBeTruthy();
  expect(samples.some((sample) => sample.hinge && sample.hinge !== "none")).toBeTruthy();
  await expect(page.locator("[data-turning='idle']")).toBeVisible();
  await expect(page.getByRole("heading", { name: "הכנה" })).toBeVisible();
  const afterText = await page.locator("[data-page='title']").innerText();
  expect(afterText).not.toBe(beforeText);
  await shot(page, "screenshot_turn_after");
  await page.getByRole("button", { name: "הערה" }).click();
  await page.getByLabel("הערות").fill("הערת בדיקה");
  await page.getByRole("button", { name: "שמירת הערה" }).click();
  await expect(page.getByText("ההערה נשמרה.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("שקשוקה לדוגמה");
  await expect(page.getByText("הערת בדיקה")).toBeVisible();
  await shot(page, "screenshot_desktop_recipe");

  await page.getByRole("link", { name: "עריכה" }).click();
  await expect(page.locator(".manuscript")).toBeVisible();
  await shot(page, "screenshot_edit_mode");
  await page.getByLabel("כותרת", { exact: true }).fill("לא לשמור");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "ביטול" }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("שקשוקה לדוגמה");
  await page.getByRole("link", { name: "עריכה" }).click();
  await page.getByLabel("כותרת", { exact: true }).fill("שקשוקה אחרי עריכה");
  await page.getByRole("button", { name: "שמירה בספר" }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("שקשוקה אחרי עריכה");
  await page.goto("/recipes/new");
  await page.getByLabel("כותרת", { exact: true }).fill("מתכון בדיקה");
  await page.getByLabel("רכיב").first().fill("לימון");
  await page.getByRole("button", { name: "שמירה בספר" }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("מתכון בדיקה");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator("[data-layout='portrait']")).toBeVisible();
  await expect(page.locator("[data-page='method']")).toBeHidden();
  await shot(page, "screenshot_mobile_recipe");
  const before = await page.locator("[data-book]").getAttribute("data-page-index");
  const box = await page.locator("[data-book]").boundingBox();
  if (!box) throw new Error("missing book");
  await page.mouse.move(box.x + 36, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 24, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  let mobileMid = false;
  await sampleCurl(page, async (turn) => {
    if (!mobileMid && turn != null && turn > 0.25 && turn < 0.8) {
      await shot(page, "screenshot_mobile_turn_mid");
      mobileMid = true;
    }
  });
  expect(mobileMid).toBeTruthy();
  await expect(page.locator("[data-book]")).not.toHaveAttribute("data-page-index", before ?? "0");
  const afterSwipe = await page.locator("[data-book]").getAttribute("data-page-index");
  await page.mouse.wheel(0, 280);
  await expect(page.locator("[data-book]")).toHaveAttribute("data-page-index", afterSwipe ?? "");
  await page.locator("[data-book]").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("[data-book]")).toHaveAttribute("data-page-index", before ?? "0");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.locator("[data-motion='reduce']")).toBeVisible();
  await page.locator("[data-book]").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("[data-book]")).toHaveAttribute("data-page-index", "1");
  await expect(page.locator("[data-leaf]")).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/import/photo");
  await expect(page.getByRole("status")).toContainText("לא מוגדר");
  await expect(page.getByLabel("צילום המתכון")).toBeDisabled();
  await shot(page, "screenshot_photo_import_unconfigured");

  await page.goto("/import");
  await expect(page.getByText("לא נדרש מפתח")).toBeVisible();
  await page.getByLabel("כתובת").fill("http://127.0.0.1/recipe");
  await page.getByRole("button", { name: "שליפת מתכון" }).click();
  await expect(page.getByText("הכתובת חסומה כי היא מצביעה לרשת פנימית.")).toBeVisible();

  await page.getByRole("button", { name: "יציאה" }).click();
  await expect(page).toHaveURL(/\/login/);
  const anonymous = await page.request.get("/api/recipes");
  expect(anonymous.status()).toBe(401);
  await page.getByLabel("שם משתמש").fill("demo");
  await page.getByLabel("סיסמה").fill(password);
  await page.getByRole("button", { name: "כניסה" }).click();
  await expect(page.getByRole("heading", { name: "ספר לדוגמה" })).toBeVisible();
});
