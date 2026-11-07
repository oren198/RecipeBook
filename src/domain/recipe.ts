import { z } from "zod";

import { HttpError } from "@/domain/http";

const textOrNull = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((value) => {
      if (value == null) return null;
      return value.length === 0 ? null : value;
    });

const ingredientSchema = z.object({
  amount: z.number().finite().nonnegative().max(100000).nullable().optional(),
  amountMax: z.number().finite().nonnegative().max(100000).nullable().optional(),
  unit: textOrNull(40),
  item: z.string().trim().max(300),
  note: textOrNull(300),
  optional: z.boolean().optional().default(false),
  uncertain: z.boolean().optional(),
});

const ingredientGroupSchema = z.object({
  title: textOrNull(80),
  items: z.array(ingredientSchema).max(80),
});

const stepSchema = z.object({
  text: z.string().trim().max(4000),
  uncertain: z.boolean().optional(),
});

const instructionGroupSchema = z.object({
  title: textOrNull(80),
  steps: z.array(stepSchema).max(80),
});

export const recipeInputSchema = z.object({
  title: z.string().trim().min(1, "חסרה כותרת").max(200),
  intro: textOrNull(5000),
  servings: z.number().int().positive().max(500).nullable().optional(),
  servingsText: textOrNull(200),
  prepMinutes: z.number().int().min(0).max(10080).nullable().optional(),
  cookMinutes: z.number().int().min(0).max(10080).nullable().optional(),
  category: textOrNull(80),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional().default([]),
  notes: textOrNull(10000),
  sourceName: textOrNull(200),
  sourceUrl: z
    .union([z.string().trim().max(2000), z.null()])
    .optional()
    .transform((value) => (value == null || value.length === 0 ? null : value))
    .refine((value) => {
      if (value == null) return true;
      try {
        const url = new URL(value);
        return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
      } catch {
        return false;
      }
    }, "כתובת המקור אינה תקינה"),
  ingredientGroups: z.array(ingredientGroupSchema).max(30).optional().default([]),
  instructionGroups: z.array(instructionGroupSchema).max(30).optional().default([]),
});

export type IngredientInput = {
  amount: number | null;
  amountMax: number | null;
  unit: string | null;
  item: string;
  note: string | null;
  optional: boolean;
  uncertain?: boolean;
};

export type IngredientGroupInput = {
  title: string | null;
  items: IngredientInput[];
};

export type StepInput = {
  text: string;
  uncertain?: boolean;
};

export type InstructionGroupInput = {
  title: string | null;
  steps: StepInput[];
};

export type RecipeInput = {
  title: string;
  intro: string | null;
  servings: number | null;
  servingsText: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  category: string | null;
  tags: string[];
  notes: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  ingredientGroups: IngredientGroupInput[];
  instructionGroups: InstructionGroupInput[];
};

export type RecipePhotoDTO = {
  id: string;
  caption: string | null;
  isSourceScan: boolean;
  width: number | null;
  height: number | null;
};

export type RecipeDTO = RecipeInput & {
  id: string;
  importMethod: "manual" | "url" | "photo" | "seed";
  isExample: boolean;
  isFavorite: boolean;
  photos: RecipePhotoDTO[];
  createdAt: string;
  updatedAt: string;
};

export type IndexRecipe = {
  id: string;
  title: string;
  category: string | null;
  tags: string[];
  intro: string | null;
  servingsText: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  isExample: boolean;
  isFavorite: boolean;
  updatedAt: string;
};

export type ImportMethod = RecipeDTO["importMethod"];

export function emptyRecipe(): RecipeInput {
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
    ingredientGroups: [{ title: null, items: [{ amount: null, amountMax: null, unit: null, item: "", note: null, optional: false }] }],
    instructionGroups: [{ title: null, steps: [{ text: "" }] }],
  };
}

export function cleanRecipe(input: RecipeInput): RecipeInput {
  const tags = [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))];
  const ingredientGroups = input.ingredientGroups
    .map((group) => ({
      title: group.title,
      items: group.items
        .map((item) => ({
          amount: item.amount,
          amountMax: item.amountMax,
          unit: item.unit,
          item: item.item.trim(),
          note: item.note,
          optional: item.optional,
        }))
        .filter((item) => item.item.length > 0),
    }))
    .filter((group) => group.items.length > 0 || (group.title && group.items.length > 0));

  const instructionGroups = input.instructionGroups
    .map((group) => ({
      title: group.title,
      steps: group.steps.map((step) => ({ text: step.text.trim() })).filter((step) => step.text.length > 0),
    }))
    .filter((group) => group.steps.length > 0);

  return {
    ...input,
    title: input.title.trim(),
    tags,
    ingredientGroups,
    instructionGroups,
  };
}

export function parseRecipeInput(body: unknown): RecipeInput {
  const parsed = recipeInputSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(
      400,
      "invalid",
      "הטופס לא תקין",
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  const recipe = cleanRecipe(parsed.data as RecipeInput);
  if (!recipe.title) {
    throw new HttpError(400, "invalid", "חסרה כותרת");
  }
  return recipe;
}

export function recipeHasSubstance(recipe: {
  title?: string | null;
  ingredientGroups?: { items?: { item?: string | null }[] }[];
  instructionGroups?: { steps?: { text?: string | null }[] }[];
}): boolean {
  const title = recipe.title?.trim() ?? "";
  const items = (recipe.ingredientGroups ?? []).some((group) =>
    (group.items ?? []).some((item) => (item.item ?? "").trim().length > 0),
  );
  const steps = (recipe.instructionGroups ?? []).some((group) =>
    (group.steps ?? []).some((step) => (step.text ?? "").trim().length > 0),
  );
  return title.length > 0 || items || steps;
}
