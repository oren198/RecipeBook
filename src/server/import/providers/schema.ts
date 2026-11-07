import { z } from "zod";

const nullableText = (max: number) =>
  z
    .union([z.string().max(max), z.null()])
    .transform((value) => {
      if (value == null) return null;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    });

export const providerRecipeSchema = z.object({
  title: nullableText(200),
  intro: nullableText(5000),
  servingsText: nullableText(200),
  prepTimeText: nullableText(80),
  cookTimeText: nullableText(80),
  category: nullableText(80),
  tags: z.array(z.string().trim().min(1).max(40)).max(30),
  notes: nullableText(4000),
  sourceName: nullableText(200),
  ingredientGroups: z
    .array(
      z.object({
        title: nullableText(80),
        items: z
          .array(
            z.object({
              amountText: nullableText(40),
              unit: nullableText(40),
              item: z.string().trim().max(300),
              note: nullableText(300),
              optional: z.boolean(),
              uncertain: z.boolean(),
            }),
          )
          .max(80),
      }),
    )
    .max(20),
  instructionGroups: z
    .array(
      z.object({
        title: nullableText(80),
        steps: z
          .array(
            z.object({
              text: z.string().trim().max(4000),
              uncertain: z.boolean(),
            }),
          )
          .max(80),
      }),
    )
    .max(20),
  warnings: z.array(z.string().trim().min(1).max(300)).max(40),
});

export type ProviderRecipe = z.infer<typeof providerRecipeSchema>;

export const RECIPE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: ["string", "null"], description: "Recipe title in the source language, or null." },
    intro: { type: ["string", "null"] },
    servingsText: { type: ["string", "null"], description: "Yield as written, or null." },
    prepTimeText: { type: ["string", "null"] },
    cookTimeText: { type: ["string", "null"] },
    category: { type: ["string", "null"] },
    tags: { type: "array", items: { type: "string" } },
    notes: { type: ["string", "null"] },
    sourceName: { type: ["string", "null"] },
    ingredientGroups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: ["string", "null"] },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                amountText: { type: ["string", "null"] },
                unit: { type: ["string", "null"] },
                item: { type: "string" },
                note: { type: ["string", "null"] },
                optional: { type: "boolean" },
                uncertain: { type: "boolean" },
              },
              required: ["amountText", "unit", "item", "note", "optional", "uncertain"],
            },
          },
        },
        required: ["title", "items"],
      },
    },
    instructionGroups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: ["string", "null"] },
          steps: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                text: { type: "string" },
                uncertain: { type: "boolean" },
              },
              required: ["text", "uncertain"],
            },
          },
        },
        required: ["title", "steps"],
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: [
    "title",
    "intro",
    "servingsText",
    "prepTimeText",
    "cookTimeText",
    "category",
    "tags",
    "notes",
    "sourceName",
    "ingredientGroups",
    "instructionGroups",
    "warnings",
  ],
} as const;

export const EXTRACTION_INSTRUCTIONS = `Extract one recipe from the source.
The source may be Hebrew, English, or mixed. Preserve its language. Do not translate.
Do not invent ingredients, amounts, times, or steps. Use null when a field is not present.
Keep amounts as written in amountText. Do not convert units.
Mark any uncertain reading with uncertain=true and add a short Hebrew warning.
If the source is not a recipe, return a null title, empty groups, and a warning.
Do not browse, fetch URLs, or use tools.`;
