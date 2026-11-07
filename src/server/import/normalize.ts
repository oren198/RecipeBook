import type { IngredientInput, InstructionGroupInput, RecipeInput } from "@/domain/recipe";

const FRACTIONS: Record<string, number> = {
  "½": 1 / 2,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 1 / 4,
  "¾": 3 / 4,
  "⅛": 1 / 8,
  "⅜": 3 / 8,
  "⅝": 5 / 8,
  "⅞": 7 / 8,
};

const UNITS = [
  "tablespoons",
  "tablespoon",
  "teaspoons",
  "teaspoon",
  "kilograms",
  "kilogram",
  "grams",
  "gram",
  "cloves",
  "clove",
  "pinches",
  "pinch",
  "ounces",
  "ounce",
  "pounds",
  "pound",
  "cups",
  "cup",
  "tbsp",
  "tsp",
  "kg",
  "ml",
  "oz",
  "lb",
  "g",
  "l",
  "כפות",
  "כפיות",
  "כפית",
  "כף",
  "כוסות",
  "כוס",
  "גרמים",
  "גרם",
  "ליטרים",
  "ליטר",
  "שיני",
  "שן",
  "יחידות",
  "יחידה",
  "חבילות",
  "חבילה",
  "קופסאות",
  "קופסה",
  "ק״ג",
  'ק"ג',
  "קג",
  "מ״ל",
  'מ"ל',
  "מל",
].sort((a, b) => b.length - a.length);

export type NormalizedImport = {
  recipe: RecipeInput;
  warnings: string[];
};

function asText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return trimmed.length ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function typeNames(node: Record<string, unknown>): string[] {
  const value = node["@type"];
  const list = Array.isArray(value) ? value : [value];
  return list
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.toLowerCase().replace(/^https?:\/\/schema\.org\//, ""));
}

function personName(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) return personName(value[0]);
  if (value && typeof value === "object" && typeof (value as { name?: unknown }).name === "string") {
    return (value as { name: string }).name.trim() || null;
  }
  return null;
}

export function parseDuration(value: unknown): { minutes: number | null; raw: string | null } {
  if (typeof value !== "string") return { minutes: null, raw: null };
  const raw = value.trim();
  if (!raw) return { minutes: null, raw: null };
  const iso = raw.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (iso && (iso[1] || iso[2] || iso[3] || iso[4])) {
    const total =
      Number(iso[1] ?? 0) * 24 * 60 + Number(iso[2] ?? 0) * 60 + Number(iso[3] ?? 0) + Number(iso[4] ?? 0) / 60;
    if (total <= 0) return { minutes: null, raw };
    return { minutes: Math.max(1, Math.round(total)), raw };
  }
  const mixed = raw.match(/^(\d+)\s*(?:hours|hour|hrs|hr|שעות|שעה)\s*(\d+)\s*(?:minutes|minute|mins|min|דקות|דקה)$/i);
  if (mixed?.[1] && mixed[2]) return { minutes: Number(mixed[1]) * 60 + Number(mixed[2]), raw };
  const simple = raw.match(/^(\d+)\s*(דקות|דקה|שעות|שעה|minutes|minute|mins|min|hours|hour|hrs|hr)$/i);
  if (simple?.[1] && simple[2]) {
    const amount = Number(simple[1]);
    const unit = simple[2].toLowerCase();
    const minutes = unit.startsWith("שע") || unit.startsWith("h") ? amount * 60 : amount;
    return { minutes, raw };
  }
  return { minutes: null, raw };
}

export function parseYield(value: unknown): { servings: number | null; servingsText: string | null; ambiguous: boolean } {
  const parts = (Array.isArray(value) ? value : value == null ? [] : [value])
    .map((item) => (typeof item === "number" ? String(item) : typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  if (parts.length === 0) return { servings: null, servingsText: null, ambiguous: false };
  const text = parts[0] ?? "";
  const looksLikePan = /ס["״']?מ|אינץ|inch|\bcm\b|\bkg\b|ק["״']?ג|גרם|ליטר|\bml\b/i.test(text);
  const match = text.match(/\d+(?:[.,]\d+)?/);
  let servings: number | null = null;
  if (!looksLikePan && match) {
    const parsed = Number(match[0].replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0 && parsed < 500) servings = Math.round(parsed);
  }
  const simple = /^\d+\s*(מנות|מנה|servings|serving|people|persons|person)?$/i.test(text);
  return { servings, servingsText: text, ambiguous: !simple };
}

function quoteFold(value: string): string {
  return value.replace(/[\"״]/g, "״").replace(/['׳]/g, "׳");
}

function splitUnit(rest: string): { unit: string | null; item: string } {
  const trimmed = rest.trim();
  const folded = quoteFold(trimmed);
  for (const unit of UNITS) {
    const foldedUnit = quoteFold(unit);
    if (folded.length < foldedUnit.length) continue;
    const candidate = folded.slice(0, foldedUnit.length);
    if (candidate.toLowerCase() !== foldedUnit.toLowerCase()) continue;
    const boundary = folded.slice(foldedUnit.length);
    if (boundary.length === 0 || /^[\s,.]/.test(boundary)) {
      return { unit: unit.replace(/["״]/g, "״"), item: boundary.replace(/^[\s,.]+/, "").trim() };
    }
  }
  return { unit: null, item: trimmed };
}

function parseNumber(raw: string): number | null {
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

export function isGroupHeader(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.endsWith(":") || trimmed.length > 40) return false;
  const inner = trimmed.slice(0, -1).trim();
  if (!inner || /\d/.test(inner)) return false;
  return splitUnit(inner).unit == null;
}

export function parseIngredientLine(line: string): IngredientInput {
  let text = line.trim().replace(/^[-*•]\s+/, "");
  const optional = /\(\s*(optional|לא חובה|רשות)\s*\)/i.test(text) || /,\s*(optional|לא חובה|רשות)\s*$/i.test(text);
  text = text
    .replace(/\(\s*(optional|לא חובה|רשות)\s*\)/gi, "")
    .replace(/,\s*(optional|לא חובה|רשות)\s*$/gi, "")
    .trim();
  const listed = text.match(/^(\d+)\.\s+(.*)$/);
  if (listed?.[2] && !/^\d/.test(listed[2])) text = listed[2].trim();

  let amount: number | null = null;
  let amountMax: number | null = null;
  let rest = text;
  const range = text.match(/^(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s+(.*)$/);
  const mixed = text.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)\s+(.*)$/);
  const slash = text.match(/^(\d+)\s*\/\s*(\d+)\s+(.*)$/);
  const unicode = text.match(/^(\d+)?\s*([½⅓⅔¼¾⅛⅜⅝⅞])\s*(.*)$/);
  const decimal = text.match(/^(\d+(?:[.,]\d+)?)\s+(.*)$/);
  if (range?.[1] && range[2] && range[3] != null) {
    amount = parseNumber(range[1]);
    amountMax = parseNumber(range[2]);
    rest = range[3];
  } else if (mixed?.[1] && mixed[2] && mixed[3] && mixed[4] != null && Number(mixed[3]) !== 0) {
    amount = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    rest = mixed[4];
  } else if (slash?.[1] && slash[2] && slash[3] != null && Number(slash[2]) !== 0) {
    amount = Number(slash[1]) / Number(slash[2]);
    rest = slash[3];
  } else if (unicode?.[2]) {
    amount = Number(unicode[1] ?? 0) + (FRACTIONS[unicode[2]] ?? 0);
    rest = unicode[3] ?? "";
  } else if (decimal?.[1] && decimal[2] != null) {
    amount = parseNumber(decimal[1]);
    rest = decimal[2];
  }
  const split = amount == null && amountMax == null ? { unit: null, item: text } : splitUnit(rest);
  return {
    amount,
    amountMax,
    unit: split.unit,
    item: split.item || text,
    note: null,
    optional,
  };
}

function ingredientGroupsFrom(value: unknown, warnings: string[]): RecipeInput["ingredientGroups"] {
  const lines = Array.isArray(value) ? value : value == null ? [] : [value];
  const groups: RecipeInput["ingredientGroups"] = [];
  let current: RecipeInput["ingredientGroups"][number] = { title: null, items: [] };
  for (const entry of lines) {
    const line = asText(entry);
    if (!line) continue;
    if (isGroupHeader(line)) {
      if (current.items.length || current.title) groups.push(current);
      current = { title: line.slice(0, -1).trim(), items: [] };
      continue;
    }
    current.items.push(parseIngredientLine(line));
  }
  if (current.items.length || current.title) groups.push(current);
  if (lines.length > 0 && groups.every((group) => group.items.length === 0)) {
    warnings.push("רשימת הרכיבים הייתה ריקה או לא קריאה.");
  }
  return groups.filter((group) => group.items.length > 0);
}

function stepText(value: unknown): string | null {
  if (typeof value === "string") return asText(value);
  if (!value || typeof value !== "object") return null;
  const node = value as Record<string, unknown>;
  const types = typeNames(node);
  if (types.includes("imageobject")) return null;
  return asText(node.text) ?? asText(node.name);
}

function instructionGroupsFrom(value: unknown, warnings: string[]): InstructionGroupInput[] {
  if (value == null || value === "") return [];
  if (typeof value === "string") {
    const steps = value
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((text) => ({ text }));
    return steps.length ? [{ title: null, steps }] : [];
  }
  if (Array.isArray(value)) {
    const groups: InstructionGroupInput[] = [];
    let loose: InstructionGroupInput = { title: null, steps: [] };
    const flush = () => {
      if (loose.steps.length) groups.push(loose);
      loose = { title: null, steps: [] };
    };
    for (const item of value) {
      if (typeof item === "string") {
        const text = item.trim();
        if (text) loose.steps.push({ text });
        continue;
      }
      if (!item || typeof item !== "object") continue;
      const node = item as Record<string, unknown>;
      const types = typeNames(node);
      if (types.includes("howtosection") || Array.isArray(node.itemListElement) && asText(node.name) && !asText(node.text)) {
        flush();
        const children = Array.isArray(node.itemListElement) ? node.itemListElement : [];
        const steps = children.map(stepText).filter((text): text is string => Boolean(text)).map((text) => ({ text }));
        if (steps.length) groups.push({ title: asText(node.name), steps });
        continue;
      }
      if (types.includes("itemlist") && node.itemListElement) {
        flush();
        groups.push(...instructionGroupsFrom(node.itemListElement, warnings));
        continue;
      }
      const text = stepText(node);
      if (text) loose.steps.push({ text });
    }
    flush();
    return groups;
  }
  if (typeof value === "object") {
    return instructionGroupsFrom([value], warnings);
  }
  warnings.push("הוראות ההכנה הגיעו בפורמט שלא זוהה.");
  return [];
}

function stringsFrom(value: unknown): string[] {
  if (typeof value === "string") return value.split(/[,،]/).map((item) => item.trim()).filter(Boolean);
  if (Array.isArray(value)) return value.flatMap((item) => stringsFrom(item));
  return [];
}

function imageCount(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "string") return 1;
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + imageCount(item), 0);
  if (typeof value === "object") return 1;
  return 0;
}

export function normalizeRecipe(raw: unknown): NormalizedImport {
  const warnings: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { recipe: blankRecipe(), warnings: ["מתכון מובנה ריק."] };
  }
  const node = raw as Record<string, unknown>;
  const title = asText(node.name) ?? "";
  if (!title) warnings.push("חסרה כותרת במתכון המובנה.");
  const intro = asText(node.description);
  const yieldInfo = parseYield(node.recipeYield ?? node.yield);
  if (yieldInfo.ambiguous && yieldInfo.servingsText) {
    warnings.push(`כמות ההגשה נשמרה כפי שנכתבה: ${yieldInfo.servingsText}`);
  }
  const prep = parseDuration(node.prepTime);
  const cook = parseDuration(node.cookTime);
  const total = parseDuration(node.totalTime);
  if (prep.raw && prep.minutes == null) warnings.push(`זמן הכנה לא זוהה: ${prep.raw}`);
  if (cook.raw && cook.minutes == null) warnings.push(`זמן בישול לא זוהה: ${cook.raw}`);
  let cookMinutes = cook.minutes;
  if (cookMinutes == null && prep.minutes == null && total.minutes != null) {
    cookMinutes = total.minutes;
    warnings.push("צוין רק זמן כולל, והוא הוצב כזמן בישול.");
  }
  const categoryValues = stringsFrom(node.recipeCategory);
  const keywordValues = stringsFrom(node.keywords);
  const cuisineValues = stringsFrom(node.recipeCuisine);
  const tags = [...new Set([...categoryValues.slice(1), ...keywordValues, ...cuisineValues])].slice(0, 30);
  const images = imageCount(node.image);
  if (images > 0) warnings.push(`נמצאו ${images} תמונות מרוחקות ולא הורדו.`);
  const sourceName = personName(node.author) ?? personName(node.publisher);
  return {
    recipe: {
      title,
      intro,
      servings: yieldInfo.servings,
      servingsText: yieldInfo.servingsText,
      prepMinutes: prep.minutes,
      cookMinutes,
      category: categoryValues[0] ?? null,
      tags,
      notes: null,
      sourceName,
      sourceUrl: null,
      ingredientGroups: ingredientGroupsFrom(node.recipeIngredient, warnings),
      instructionGroups: instructionGroupsFrom(node.recipeInstructions, warnings),
    },
    warnings,
  };
}

function blankRecipe(): RecipeInput {
  return {
    title: "",
    intro: null,
    servings: null,
    servingsText: null,
    prepMinutes: null,
    cookMinutes: null,
    category: null,
    tags: [],
    notes: null,
    sourceName: null,
    sourceUrl: null,
    ingredientGroups: [],
    instructionGroups: [],
  };
}
