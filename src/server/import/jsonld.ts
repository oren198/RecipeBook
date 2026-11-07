import { decodeBasicEntities } from "@/server/import/html-text";

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

export function extractJsonLd(html: string): { values: unknown[]; invalidBlocks: number } {
  const values: unknown[] = [];
  let invalidBlocks = 0;
  for (const match of html.matchAll(SCRIPT_RE)) {
    const attrs = match[1] ?? "";
    if (!/type\s*=\s*["']application\/ld\+json["']/i.test(attrs)) continue;
    const raw = decodeBasicEntities((match[2] ?? "").trim()).replace(/^\uFEFF/, "");
    if (!raw) continue;
    try {
      values.push(JSON.parse(raw) as unknown);
    } catch {
      invalidBlocks += 1;
    }
  }
  return { values, invalidBlocks };
}

function typeNames(node: Record<string, unknown>): string[] {
  const value = node["@type"];
  const list = Array.isArray(value) ? value : [value];
  return list
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.toLowerCase().replace(/^https?:\/\/schema\.org\//, "").replace(/^\/+/, ""));
}

function isRecipe(node: Record<string, unknown>): boolean {
  return typeNames(node).includes("recipe");
}

export function collectRecipes(data: unknown, out: unknown[] = [], depth = 0): unknown[] {
  if (depth > 8 || data == null) return out;
  if (Array.isArray(data)) {
    for (const item of data) collectRecipes(item, out, depth + 1);
    return out;
  }
  if (typeof data !== "object") return out;
  const node = data as Record<string, unknown>;
  if (isRecipe(node)) {
    out.push(node);
    return out;
  }
  for (const key of ["@graph", "mainEntity", "hasPart", "itemListElement"]) {
    if (key in node) collectRecipes(node[key], out, depth + 1);
  }
  return out;
}

export function recipesFromHtml(html: string): { recipes: unknown[]; invalidBlocks: number } {
  const extracted = extractJsonLd(html);
  const recipes: unknown[] = [];
  for (const value of extracted.values) collectRecipes(value, recipes);
  return { recipes, invalidBlocks: extracted.invalidBlocks };
}
