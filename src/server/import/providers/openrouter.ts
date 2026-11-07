import { recipeHasSubstance, type IngredientInput, type RecipeInput } from "@/domain/recipe";
import { HttpError } from "@/domain/http";
import { parseDuration, parseIngredientLine, parseYield } from "@/server/import/normalize";
import { EXTRACTION_INSTRUCTIONS, providerRecipeSchema, RECIPE_JSON_SCHEMA, type ProviderRecipe } from "@/server/import/providers/schema";
import type { ExtractionProvider, ProviderExtraction } from "@/server/import/providers/types";

const MAX_TEXT_CHARS = 12_000;
const ABSOLUTE_MAX_TOKENS = 4096;
const ABSOLUTE_MAX_TIMEOUT_MS = 60_000;
const MAX_IMAGE_BYTES = 3_500_000;
const PLACEHOLDER_KEY = /^(changeme|change-me|replace-me|your[-_]?key|placeholder|xxx+|todo|sk-or-v1-placeholder)$/i;

type Env = Record<string, string | undefined>;

type OpenRouterConfig =
  | { ok: false; hint: string }
  | {
      ok: true;
      hint: string;
      apiKey: string;
      model: string;
      baseUrl: string;
      maxTokens: number;
      timeoutMs: number;
      title: string;
      referer?: string;
    };

export function readOpenRouterConfig(env: Env): OpenRouterConfig {
  const selected = (env.RECIPE_EXTRACT_PROVIDER ?? "none").trim().toLowerCase();
  if (selected !== "openrouter") {
    return {
      ok: false,
      hint: "חילוץ חופשי וזיהוי תמונה לא מוגדרים. ייבוא schema.org עובד בלי מפתח. ראו docs/IMPORT_PROVIDERS.md",
    };
  }
  const apiKey = env.OPENROUTER_API_KEY?.trim() ?? "";
  const model = env.OPENROUTER_MODEL?.trim() ?? "";
  if (!apiKey) {
    return { ok: false, hint: "OpenRouter נבחר, אבל OPENROUTER_API_KEY לא הוגדר. לא נשלחת קריאה בתשלום." };
  }
  if (apiKey.length < 20 || PLACEHOLDER_KEY.test(apiKey)) {
    return { ok: false, hint: "מפתח OpenRouter נראה כמציין מקום. לא נשלחת קריאה בתשלום." };
  }
  if (!model || model.length > 120 || /\s/.test(model)) {
    return { ok: false, hint: "חסר OPENROUTER_MODEL תקין. לא נבחר דגם אוטומטית ולא נשלחת קריאה." };
  }
  let base: URL;
  try {
    base = new URL(env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1");
  } catch {
    return { ok: false, hint: "OPENROUTER_BASE_URL אינו תקין. לא נשלחת קריאה." };
  }
  const path = base.pathname.replace(/\/$/, "");
  if (base.protocol !== "https:" || base.hostname !== "openrouter.ai" || path !== "/api/v1" || base.username || base.password) {
    return { ok: false, hint: "OPENROUTER_BASE_URL חייב להיות https://openrouter.ai/api/v1. לא נשלחת קריאה." };
  }
  const requestedTokens = Number(env.OPENROUTER_MAX_TOKENS ?? 1800);
  const maxTokens = Math.min(ABSOLUTE_MAX_TOKENS, Math.max(256, Number.isFinite(requestedTokens) ? Math.floor(requestedTokens) : 1800));
  const requestedTimeout = Number(env.OPENROUTER_TIMEOUT_MS ?? 25_000);
  const timeoutMs = Math.min(
    ABSOLUTE_MAX_TIMEOUT_MS,
    Math.max(3000, Number.isFinite(requestedTimeout) ? Math.floor(requestedTimeout) : 25_000),
  );
  const referer = env.OPENROUTER_HTTP_REFERER?.trim();
  return {
    ok: true,
    hint: "ספק OpenRouter מוגדר. זיהוי תמונה וחילוץ טקסט חופשי יישלחו רק אחרי פעולה מפורשת.",
    apiKey,
    model,
    baseUrl: "https://openrouter.ai/api/v1",
    maxTokens,
    timeoutMs,
    title: (env.OPENROUTER_APP_TITLE?.trim() || "Family Recipe Book").slice(0, 80),
    referer: referer && referer.length < 200 ? referer : undefined,
  };
}

function providerFailure(code: string, message: string): HttpError {
  return new HttpError(502, code, message);
}

function toRecipe(parsed: ProviderRecipe): ProviderExtraction {
  const warnings = [...parsed.warnings];
  const prep = parseDuration(parsed.prepTimeText);
  const cook = parseDuration(parsed.cookTimeText);
  if (parsed.prepTimeText && prep.minutes == null) warnings.push(`זמן הכנה לא זוהה: ${parsed.prepTimeText}`);
  if (parsed.cookTimeText && cook.minutes == null) warnings.push(`זמן בישול לא זוהה: ${parsed.cookTimeText}`);
  const yieldInfo = parseYield(parsed.servingsText);
  if (yieldInfo.ambiguous && yieldInfo.servingsText) warnings.push(`כמות ההגשה נשמרה כפי שנכתבה: ${yieldInfo.servingsText}`);
  const ingredientGroups = parsed.ingredientGroups
    .map((group) => ({
      title: group.title,
      items: group.items
        .filter((item) => item.item.trim().length > 0)
        .map((item) => ingredientFromProvider(item, warnings)),
    }))
    .filter((group) => group.items.length > 0);
  const instructionGroups = parsed.instructionGroups
    .map((group) => ({
      title: group.title,
      steps: group.steps
        .filter((step) => step.text.trim().length > 0)
        .map((step) => {
          if (step.uncertain) warnings.push("שלב סומן כלא ודאי.");
          return { text: step.text.trim(), uncertain: step.uncertain };
        }),
    }))
    .filter((group) => group.steps.length > 0);
  const recipe: RecipeInput = {
    title: parsed.title ?? "",
    intro: parsed.intro,
    servings: yieldInfo.servings,
    servingsText: yieldInfo.servingsText,
    prepMinutes: prep.minutes,
    cookMinutes: cook.minutes,
    category: parsed.category,
    tags: [...new Set(parsed.tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 30),
    notes: parsed.notes,
    sourceName: parsed.sourceName,
    sourceUrl: null,
    ingredientGroups,
    instructionGroups,
  };
  if (!recipeHasSubstance(recipe)) {
    throw providerFailure("provider_empty", "הספק לא החזיר מתכון. לא נשמר כלום.");
  }
  if (!recipe.title) warnings.push("חסרה כותרת. מלאו אותה לפני השמירה.");
  return { recipe, warnings: [...new Set(warnings)] };
}

function ingredientFromProvider(
  item: ProviderRecipe["ingredientGroups"][number]["items"][number],
  warnings: string[],
): IngredientInput {
  const pieces = [item.amountText, item.unit, item.item].filter((part): part is string => Boolean(part && part.trim()));
  const parsed = parseIngredientLine(pieces.join(" "));
  if (item.uncertain) warnings.push(`רכיב לא ודאי: ${item.item}`);
  return {
    amount: parsed.amount,
    amountMax: parsed.amountMax,
    unit: parsed.unit ?? item.unit,
    item: item.item.trim() || parsed.item,
    note: item.note,
    optional: item.optional,
    uncertain: item.uncertain || undefined,
  };
}

async function complete(config: Extract<OpenRouterConfig, { ok: true }>, content: unknown, fetchImpl: typeof fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(config.timeoutMs),
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
        "x-openrouter-title": config.title,
        ...(config.referer ? { "http-referer": config.referer } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: config.maxTokens,
        stream: false,
        messages: [{ role: "user", content }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "recipe_extraction",
            strict: true,
            schema: RECIPE_JSON_SCHEMA,
          },
        },
        provider: { require_parameters: true },
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw providerFailure("provider_timeout", "הספק לא ענה בזמן. לא נשמר מתכון.");
    }
    throw providerFailure("provider_unreachable", "לא הצלחנו להגיע לספק. לא נשמר מתכון.");
  }
  if (!response.ok) {
    console.error(`openrouter status ${response.status}`);
    throw providerFailure("provider_rejected", "הספק דחה את הבקשה. לא נשמר מתכון.");
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw providerFailure("provider_invalid", "תשובת הספק אינה JSON. לא נשמר מתכון.");
  }
  const text = readMessageContent(payload);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw providerFailure("provider_invalid", "הספק לא החזיר מתכון במבנה שנדרש. לא נשמר מתכון.");
  }
}

function readMessageContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw providerFailure("provider_invalid", "תשובת הספק אינה תקינה. לא נשמר מתכון.");
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw providerFailure("provider_empty", "הספק לא החזיר תוכן. לא נשמר מתכון.");
  }
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  const content = message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw providerFailure("provider_empty", "הספק לא החזיר תוכן. לא נשמר מתכון.");
  }
  return content;
}

function parseProviderRecipe(value: unknown): ProviderExtraction {
  const parsed = providerRecipeSchema.safeParse(value);
  if (!parsed.success) {
    throw providerFailure("provider_invalid", "תשובת הספק לא עברה בדיקת מבנה. לא נשמר מתכון.");
  }
  return toRecipe(parsed.data);
}

export function createOpenRouterProvider(options?: { env?: Env; fetchImpl?: typeof fetch }): ExtractionProvider {
  const env = options?.env ?? process.env;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const requireConfig = () => {
    const config = readOpenRouterConfig(env);
    if (!config.ok) throw new HttpError(409, "vision_not_configured", config.hint);
    return config;
  };
  return {
    id: "openrouter",
    isConfigured() {
      return readOpenRouterConfig(env).ok;
    },
    configurationHint() {
      return readOpenRouterConfig(env).hint;
    },
    async extractFromText(input) {
      const config = requireConfig();
      const text = input.text.trim().slice(0, MAX_TEXT_CHARS);
      if (text.length < 20) {
        throw providerFailure("provider_empty", "אין מספיק טקסט לחילוץ. לא נשמר מתכון.");
      }
      const content = [
        { type: "text", text: `${EXTRACTION_INSTRUCTIONS}\n\nSource URL (do not fetch): ${input.url ?? "unknown"}\n\nSource text:\n${text}` },
      ];
      return parseProviderRecipe(await complete(config, content, fetchImpl));
    },
    async extractFromImage(input) {
      const config = requireConfig();
      if (input.mediaType !== "image/jpeg") {
        throw new HttpError(400, "not_image", "לספק נשלחת רק תמונת JPEG שעברה קידוד מחדש.");
      }
      if (input.bytes.length === 0 || input.bytes.length > MAX_IMAGE_BYTES) {
        throw new HttpError(413, "image_too_large_for_provider", "התמונה גדולה מדי לשליחה לספק. לא נשלחה קריאה.");
      }
      const content = [
        { type: "text", text: EXTRACTION_INSTRUCTIONS },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${input.bytes.toString("base64")}` } },
      ];
      return parseProviderRecipe(await complete(config, content, fetchImpl));
    },
  };
}

export const unconfiguredProvider: ExtractionProvider = {
  id: "none",
  isConfigured: () => false,
  configurationHint: () => readOpenRouterConfig({ RECIPE_EXTRACT_PROVIDER: "none" }).hint,
  async extractFromText() {
    throw new HttpError(409, "vision_not_configured", unconfiguredProvider.configurationHint());
  },
  async extractFromImage() {
    throw new HttpError(409, "vision_not_configured", unconfiguredProvider.configurationHint());
  },
};
