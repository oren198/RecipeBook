import { describe, expect, it } from "vitest";

import { recipesFromHtml } from "@/server/import/jsonld";
import { isGroupHeader, normalizeRecipe, parseDuration, parseIngredientLine } from "@/server/import/normalize";

const graph = `
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", "name": "Example" },
    {
      "@type": ["Recipe", "Thing"],
      "name": "שקשוקה",
      "description": "ארוחת בוקר",
      "recipeYield": ["4 מנות", "4 servings"],
      "prepTime": "PT15M",
      "cookTime": "PT30M",
      "recipeCategory": ["עיקרית", "מחבת"],
      "keywords": "עגבניות, ביצים",
      "author": { "@type": "Person", "name": "מקור לדוגמה" },
      "image": ["https://example.com/a.jpg", { "@type": "ImageObject", "url": "https://example.com/b.jpg" }],
      "recipeIngredient": ["לבלילה:", "1 כוס קמח", "1½ כפות שמן", "1-2 בצלים", "מלח", "1. סוכר (לא חובה)"],
      "recipeInstructions": [
        {
          "@type": "HowToSection",
          "name": "רוטב",
          "itemListElement": [{ "@type": "HowToStep", "text": "מבשלים את העגבניות." }]
        },
        { "@type": "HowToStep", "text": "מוסיפים ביצים." }
      ]
    }
  ]
}
</script>`;

describe("json-ld collection", () => {
  it("reads a recipe inside @graph and ignores the website node", () => {
    const found = recipesFromHtml(graph);
    expect(found.recipes).toHaveLength(1);
    const normalized = normalizeRecipe(found.recipes[0]);
    expect(normalized.recipe.title).toBe("שקשוקה");
    expect(normalized.recipe.servings).toBe(4);
    expect(normalized.recipe.servingsText).toBe("4 מנות");
    expect(normalized.recipe.prepMinutes).toBe(15);
    expect(normalized.recipe.cookMinutes).toBe(30);
    expect(normalized.recipe.category).toBe("עיקרית");
    expect(normalized.recipe.tags).toEqual(expect.arrayContaining(["מחבת", "עגבניות", "ביצים"]));
    expect(normalized.recipe.sourceName).toBe("מקור לדוגמה");
    expect(normalized.warnings.some((warning) => warning.includes("תמונות מרוחקות"))).toBe(true);
    expect(normalized.recipe.ingredientGroups[0]?.title).toBe("לבלילה");
    expect(normalized.recipe.ingredientGroups[0]?.items.map((item) => item.item)).toEqual(
      expect.arrayContaining(["קמח", "שמן", "בצלים", "מלח"]),
    );
    expect(normalized.recipe.instructionGroups.map((group) => group.title)).toEqual(["רוטב", null]);
  });

  it("reads an array and a full schema.org type", () => {
    const html = `<script type="application/ld+json">[{"@type":"BreadcrumbList"},{"@type":"https://schema.org/Recipe","name":"Salad","recipeIngredient":"עגבנייה"}]</script>`;
    const found = recipesFromHtml(html);
    expect(found.recipes).toHaveLength(1);
    const normalized = normalizeRecipe(found.recipes[0]);
    expect(normalized.recipe.title).toBe("Salad");
    expect(normalized.recipe.ingredientGroups[0]?.items[0]?.item).toBe("עגבנייה");
  });

  it("does not invent fields that are missing", () => {
    const normalized = normalizeRecipe({ "@type": "Recipe", name: "רק שם" });
    expect(normalized.recipe.intro).toBeNull();
    expect(normalized.recipe.servings).toBeNull();
    expect(normalized.recipe.prepMinutes).toBeNull();
    expect(normalized.recipe.cookMinutes).toBeNull();
    expect(normalized.recipe.ingredientGroups).toEqual([]);
    expect(normalized.recipe.instructionGroups).toEqual([]);
    expect(normalized.recipe.notes).toBeNull();
  });

  it("keeps an unparseable time as a warning instead of guessing", () => {
    const normalized = normalizeRecipe({ "@type": "Recipe", name: "זמן", prepTime: "soon" });
    expect(normalized.recipe.prepMinutes).toBeNull();
    expect(normalized.warnings.join(" ")).toContain("soon");
  });

  it("uses total time only with a warning when prep and cook are absent", () => {
    const normalized = normalizeRecipe({ "@type": "Recipe", name: "זמן", totalTime: "PT1H" });
    expect(normalized.recipe.cookMinutes).toBe(60);
    expect(normalized.warnings.join(" ")).toContain("זמן כולל");
  });

  it("keeps a pan size out of the numeric servings", () => {
    const normalized = normalizeRecipe({ "@type": "Recipe", name: "תבנית", recipeYield: "תבנית 26 ס״מ" });
    expect(normalized.recipe.servings).toBeNull();
    expect(normalized.recipe.servingsText).toBe("תבנית 26 ס״מ");
  });

  it("warns and keeps the first recipe when several exist", () => {
    const html = `<script type="application/ld+json">[{"@type":"Recipe","name":"ראשון"},{"@type":"Recipe","name":"שני"}]</script>`;
    const found = recipesFromHtml(html);
    expect(found.recipes).toHaveLength(2);
    expect(normalizeRecipe(found.recipes[0]).recipe.title).toBe("ראשון");
  });
});

describe("ingredient lines", () => {
  it("parses hebrew and english amounts without inventing a unit", () => {
    expect(parseIngredientLine("1 כוס קמח")).toMatchObject({ amount: 1, unit: "כוס", item: "קמח" });
    expect(parseIngredientLine("1½ כפות שמן")).toMatchObject({ amount: 1.5, unit: "כפות", item: "שמן" });
    expect(parseIngredientLine("1 1/2 cup flour")).toMatchObject({ amount: 1.5, unit: "cup", item: "flour" });
    expect(parseIngredientLine("1-2 בצלים")).toMatchObject({ amount: 1, amountMax: 2, item: "בצלים" });
    expect(parseIngredientLine("מלח")).toMatchObject({ amount: null, unit: null, item: "מלח" });
    expect(parseIngredientLine("1. סוכר (לא חובה)")).toMatchObject({ item: "סוכר", optional: true, amount: null });
    expect(isGroupHeader("לבלילה:")).toBe(true);
    expect(isGroupHeader("1 כוס:")).toBe(false);
  });
});

describe("durations", () => {
  it("parses iso and explicit phrases", () => {
    expect(parseDuration("PT1H20M").minutes).toBe(80);
    expect(parseDuration("PT45S").minutes).toBe(1);
    expect(parseDuration("15 דקות").minutes).toBe(15);
    expect(parseDuration("1 hour 20 minutes").minutes).toBe(80);
    expect(parseDuration("soon").minutes).toBeNull();
  });
});
