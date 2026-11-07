import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { RecipeInput } from "@/domain/recipe";

export const families = pgTable("families", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_username_lower").on(sql`lower(${table.username})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    intro: text("intro"),
    servings: integer("servings"),
    servingsText: text("servings_text"),
    prepMinutes: integer("prep_minutes"),
    cookMinutes: integer("cook_minutes"),
    category: text("category"),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    notes: text("notes"),
    sourceName: text("source_name"),
    sourceUrl: text("source_url"),
    importMethod: text("import_method").notNull().default("manual"),
    isExample: boolean("is_example").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("recipes_family_idx").on(table.familyId), index("recipes_category_idx").on(table.familyId, table.category)],
);

export const ingredientGroups = pgTable(
  "ingredient_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title"),
  },
  (table) => [index("ingredient_groups_recipe_idx").on(table.recipeId, table.position)],
);

export const ingredients = pgTable(
  "ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => ingredientGroups.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    amount: doublePrecision("amount"),
    amountMax: doublePrecision("amount_max"),
    unit: text("unit"),
    item: text("item").notNull(),
    note: text("note"),
    raw: text("raw"),
    optional: boolean("optional").notNull().default(false),
  },
  (table) => [index("ingredients_group_idx").on(table.groupId, table.position)],
);

export const instructionGroups = pgTable(
  "instruction_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title"),
  },
  (table) => [index("instruction_groups_recipe_idx").on(table.recipeId, table.position)],
);

export const steps = pgTable(
  "steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => instructionGroups.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    text: text("text").notNull(),
  },
  (table) => [index("steps_group_idx").on(table.groupId, table.position)],
);

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id").references(() => recipes.id, { onDelete: "cascade" }),
    draftId: uuid("draft_id"),
    storageKey: text("storage_key").notNull().unique(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    caption: text("caption"),
    isSourceScan: boolean("is_source_scan").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("photos_recipe_idx").on(table.recipeId), index("photos_family_idx").on(table.familyId)],
);

export const favorites = pgTable(
  "favorites",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.recipeId] })],
);

export type RecipeSnapshot = RecipeInput & {
  importMethod: string;
  isExample: boolean;
  sourcePhotoIds: string[];
};

export const recipeRevisions = pgTable(
  "recipe_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    summary: text("summary").notNull(),
    snapshot: jsonb("snapshot").$type<RecipeSnapshot>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("revisions_recipe_idx").on(table.recipeId, table.createdAt)],
);

export const importSources = pgTable(
  "import_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    sourceUrl: text("source_url"),
    photoId: uuid("photo_id").references(() => photos.id, { onDelete: "set null" }),
    rawPayload: jsonb("raw_payload"),
    normalizedPayload: jsonb("normalized_payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("import_sources_recipe_idx").on(table.recipeId)],
);

export const importDrafts = pgTable("import_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id")
    .notNull()
    .references(() => families.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  sourceUrl: text("source_url"),
  photoId: uuid("photo_id").references(() => photos.id, { onDelete: "set null" }),
  recipe: jsonb("recipe").$type<RecipeInput>().notNull(),
  warnings: jsonb("warnings").$type<string[]>().notNull(),
  rawPayload: jsonb("raw_payload"),
  extractor: text("extractor").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
});

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true, mode: "date" }).notNull(),
  count: integer("count").notNull(),
});
