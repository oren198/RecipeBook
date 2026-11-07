"use client";

import { useEffect, useMemo, useState } from "react";

import { emptyRecipe, type IngredientGroupInput, type InstructionGroupInput, type RecipeInput } from "@/domain/recipe";
import { api } from "@/lib/api";

type Props = {
  initial?: RecipeInput;
  recipeId?: string;
  draftId?: string;
  warnings?: string[];
  submitLabel: string;
  heading: string;
};

export function RecipeForm({ initial, recipeId, draftId, warnings = [], submitLabel, heading }: Props) {
  const storageKey = draftId ? `import-draft:${draftId}` : recipeId ? `recipe-draft:${recipeId}` : "recipe-draft:new";
  const [recipe, setRecipe] = useState<RecipeInput>(initial ?? emptyRecipe());
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const baseline = useMemo(() => JSON.stringify(initial ?? emptyRecipe()), [initial]);
  const dirty = JSON.stringify(recipe) !== baseline;

  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey);
    if (!saved) return;
    queueMicrotask(() => {
      try {
        const parsed = JSON.parse(saved) as RecipeInput;
        if (parsed && typeof parsed.title === "string") {
          setRecipe(parsed);
          setRestored(true);
        }
      } catch {
        sessionStorage.removeItem(storageKey);
      }
    });
  }, [storageKey]);

  useEffect(() => {
    if (dirty) sessionStorage.setItem(storageKey, JSON.stringify(recipe));
  }, [dirty, recipe, storageKey]);

  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function updateGroup(index: number, group: IngredientGroupInput) {
    setRecipe((current) => ({
      ...current,
      ingredientGroups: current.ingredientGroups.map((item, itemIndex) => (itemIndex === index ? group : item)),
    }));
  }

  function updateSteps(index: number, group: InstructionGroupInput) {
    setRecipe((current) => ({
      ...current,
      instructionGroups: current.instructionGroups.map((item, itemIndex) => (itemIndex === index ? group : item)),
    }));
  }

  return (
    <form
      className="manuscript"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setPending(true);
        const path = draftId ? `/api/import/drafts/${draftId}/commit` : recipeId ? `/api/recipes/${recipeId}` : "/api/recipes";
        const method = draftId || !recipeId ? "POST" : "PATCH";
        void api<{ recipe: { id: string } }>(path, { method, body: JSON.stringify(recipe) })
          .then((result) => {
            sessionStorage.removeItem(storageKey);
            window.location.assign(`/recipes/${result.recipe.id}`);
          })
          .catch((reason: Error) => {
            setError(reason.message);
            setPending(false);
          });
      }}
    >
      <div className="edit-bar">
        <button className="button primary" type="submit" disabled={pending}>
          {pending ? "שומרים…" : submitLabel}
        </button>
        <button
          className="button quiet"
          type="button"
          onClick={() => {
            if (dirty && !window.confirm("לצאת בלי לשמור את השינויים?")) return;
            sessionStorage.removeItem(storageKey);
            window.location.assign(recipeId ? `/recipes/${recipeId}` : "/");
          }}
        >
          ביטול
        </button>
      </div>
      <h1>{heading}</h1>
      {warnings.length > 0 ? (
        <div className="callout" role="status">
          <strong>בדקו לפני השמירה. עדיין לא נשמר בספר.</strong>
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {restored ? <p className="callout">שוחזרה טיוטה שלא נשמרה במכשיר הזה.</p> : null}
      {dirty ? <p className="status">יש שינויים שלא נשמרו.</p> : null}
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
      <label className="field">
        <span>כותרת</span>
        <input aria-label="כותרת" value={recipe.title} onChange={(event) => setRecipe({ ...recipe, title: event.target.value })} required />
      </label>
      <label className="field">
        <span>פתיח</span>
        <textarea value={recipe.intro ?? ""} onChange={(event) => setRecipe({ ...recipe, intro: event.target.value || null })} />
      </label>
      <div className="grid-2">
        <label className="field">
          <span>מנות (מספר, אם יש)</span>
          <input
            type="number"
            min={1}
            value={recipe.servings ?? ""}
            onChange={(event) => setRecipe({ ...recipe, servings: event.target.value ? Number(event.target.value) : null })}
          />
        </label>
        <label className="field">
          <span>תיאור כמות</span>
          <input value={recipe.servingsText ?? ""} onChange={(event) => setRecipe({ ...recipe, servingsText: event.target.value || null })} />
        </label>
        <label className="field">
          <span>הכנה בדקות</span>
          <input
            type="number"
            min={0}
            value={recipe.prepMinutes ?? ""}
            onChange={(event) => setRecipe({ ...recipe, prepMinutes: event.target.value ? Number(event.target.value) : null })}
          />
        </label>
        <label className="field">
          <span>בישול בדקות</span>
          <input
            type="number"
            min={0}
            value={recipe.cookMinutes ?? ""}
            onChange={(event) => setRecipe({ ...recipe, cookMinutes: event.target.value ? Number(event.target.value) : null })}
          />
        </label>
      </div>
      <label className="field">
        <span>פרק</span>
        <input value={recipe.category ?? ""} onChange={(event) => setRecipe({ ...recipe, category: event.target.value || null })} />
      </label>
      <label className="field">
        <span>תגיות, מופרדות בפסיק</span>
        <input
          value={recipe.tags.join(", ")}
          onChange={(event) =>
            setRecipe({
              ...recipe,
              tags: event.target.value
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
            })
          }
        />
      </label>
      <h2>רכיבים</h2>
      {recipe.ingredientGroups.map((group, groupIndex) => (
        <fieldset key={groupIndex} className="field">
          <label>
            כותרת קבוצה
            <input
              value={group.title ?? ""}
              onChange={(event) => updateGroup(groupIndex, { ...group, title: event.target.value || null })}
            />
          </label>
          {group.items.map((item, itemIndex) => (
            <div className={`ingredient-edit${item.uncertain ? " uncertain" : ""}`} key={itemIndex}>
              <input
                aria-label="כמות"
                value={item.amount ?? ""}
                onChange={(event) => {
                  const items = group.items.slice();
                  items[itemIndex] = { ...item, amount: event.target.value ? Number(event.target.value) : null };
                  updateGroup(groupIndex, { ...group, items });
                }}
              />
              <input
                aria-label="יחידה"
                value={item.unit ?? ""}
                onChange={(event) => {
                  const items = group.items.slice();
                  items[itemIndex] = { ...item, unit: event.target.value || null };
                  updateGroup(groupIndex, { ...group, items });
                }}
              />
              <input
                aria-label="רכיב"
                value={item.item}
                onChange={(event) => {
                  const items = group.items.slice();
                  items[itemIndex] = { ...item, item: event.target.value };
                  updateGroup(groupIndex, { ...group, items });
                }}
              />
              <button
                className="button quiet"
                type="button"
                onClick={() => updateGroup(groupIndex, { ...group, items: group.items.filter((_, index) => index !== itemIndex) })}
              >
                הסרה
              </button>
            </div>
          ))}
          <button
            className="button quiet"
            type="button"
            onClick={() =>
              updateGroup(groupIndex, {
                ...group,
                items: [...group.items, { amount: null, amountMax: null, unit: null, item: "", note: null, optional: false }],
              })
            }
          >
            רכיב נוסף
          </button>
        </fieldset>
      ))}
      <button
        className="button secondary"
        type="button"
        onClick={() =>
          setRecipe({
            ...recipe,
            ingredientGroups: [...recipe.ingredientGroups, { title: "", items: [] }],
          })
        }
      >
        קבוצת רכיבים
      </button>
      <h2>הכנה</h2>
      {recipe.instructionGroups.map((group, groupIndex) => (
        <fieldset key={groupIndex} className="field">
          <label>
            כותרת שלב
            <input value={group.title ?? ""} onChange={(event) => updateSteps(groupIndex, { ...group, title: event.target.value || null })} />
          </label>
          {group.steps.map((step, stepIndex) => (
            <div className={`step-edit${step.uncertain ? " uncertain" : ""}`} key={stepIndex}>
              <textarea
                aria-label="שלב"
                value={step.text}
                onChange={(event) => {
                  const steps = group.steps.slice();
                  steps[stepIndex] = { ...step, text: event.target.value };
                  updateSteps(groupIndex, { ...group, steps });
                }}
              />
              <button
                className="button quiet"
                type="button"
                onClick={() => updateSteps(groupIndex, { ...group, steps: group.steps.filter((_, index) => index !== stepIndex) })}
              >
                הסרה
              </button>
            </div>
          ))}
          <button
            className="button quiet"
            type="button"
            onClick={() => updateSteps(groupIndex, { ...group, steps: [...group.steps, { text: "" }] })}
          >
            שלב נוסף
          </button>
        </fieldset>
      ))}
      <label className="field">
        <span>הערות</span>
        <textarea value={recipe.notes ?? ""} onChange={(event) => setRecipe({ ...recipe, notes: event.target.value || null })} />
      </label>
      <label className="field">
        <span>שם המקור</span>
        <input value={recipe.sourceName ?? ""} onChange={(event) => setRecipe({ ...recipe, sourceName: event.target.value || null })} />
      </label>
      <label className="field">
        <span>קישור מקור</span>
        <input value={recipe.sourceUrl ?? ""} onChange={(event) => setRecipe({ ...recipe, sourceUrl: event.target.value || null })} />
      </label>
      <div className="actions">
        <button className="button primary" type="submit" disabled={pending}>
          {pending ? "שומרים…" : submitLabel}
        </button>
        <button
          className="button quiet"
          type="button"
          onClick={() => {
            if (dirty && !window.confirm("לצאת בלי לשמור את השינויים?")) return;
            sessionStorage.removeItem(storageKey);
            window.location.assign(recipeId ? `/recipes/${recipeId}` : "/");
          }}
        >
          ביטול
        </button>
      </div>
    </form>
  );
}
