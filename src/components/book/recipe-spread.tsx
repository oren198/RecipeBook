"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { BookScene, useBookFlags } from "@/components/book/scene";
import type { RecipeDTO } from "@/domain/recipe";
import { api } from "@/lib/api";
import { formatAmount, formatMinutes, scaleAmount } from "@/lib/format";

type Neighbor = { id: string; title: string } | null;
type Ing = { key: string; amount: string | null; item: string; optional: boolean; rawKey: string };
type St = { key: string; n: number; text: string };
type Sheet =
  | { kind: "opening" }
  | { kind: "ingredients"; items: Ing[]; part: string }
  | { kind: "steps"; items: St[]; part: string }
  | { kind: "end" };

const ING_PAGE = 8;
const STEP_PAGE = 4;

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [[]];
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) pages.push(items.slice(index, index + size));
  return pages;
}

export function RecipeSpread({ recipe, previous, next }: { recipe: RecipeDTO; previous: Neighbor; next: Neighbor }) {
  const { portrait, reduced } = useBookFlags();
  const [cooking, setCooking] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [doneSteps, setDoneSteps] = useState<Record<string, boolean>>({});
  const [favorite, setFavorite] = useState(recipe.isFavorite);
  const [notes, setNotes] = useState(recipe.notes ?? "");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteState, setNoteState] = useState<string | null>(null);
  const [target, setTarget] = useState(recipe.servings ?? 1);
  const [turning, setTurning] = useState<"next" | "prev" | null>(null);
  const pendingIndex = useRef<number | null>(null);
  const factor = recipe.servings && target > 0 ? target / recipe.servings : 1;

  const sheets = useMemo(() => buildSheets(recipe, factor), [recipe, factor]);
  const step = portrait ? 1 : 2;
  const resetKey = `${recipe.id}:${portrait}:${cooking}`;
  const [cursor, setCursor] = useState({ key: resetKey, index: 0 });
  const index = cursor.key === resetKey ? cursor.index : 0;
  function setIndex(nextIndex: number) {
    setCursor({ key: resetKey, index: nextIndex });
  }
  const maxIndex = Math.max(0, portrait ? sheets.length - 1 : Math.ceil(sheets.length / 2) * 2 - 2);

  function commit(dir: "next" | "prev") {
    const delta = dir === "next" ? step : -step;
    const destination = index + delta;
    if (destination < 0) {
      if (previous) window.location.assign(`/recipes/${previous.id}`);
      return;
    }
    if (destination > maxIndex) {
      if (next) window.location.assign(`/recipes/${next.id}`);
      return;
    }
    if (reduced) {
      setIndex(destination);
      return;
    }
    pendingIndex.current = destination;
    setTurning(dir);
  }

  function finishTurn() {
    if (pendingIndex.current != null) setIndex(pendingIndex.current);
    pendingIndex.current = null;
    setTurning(null);
  }

  const right = sheets[index] ?? sheets[0];
  const left = sheets[index + 1];
  const incomingRight = sheets[index + step];
  const previousRight = sheets[index - step];

  const totalSteps = sheets.filter((sheet) => sheet?.kind === "steps").reduce((sum, sheet) => sum + (sheet.kind === "steps" ? sheet.items.length : 0), 0);
  const doneCount = Object.values(doneSteps).filter(Boolean).length;

  return (
    <div className={cooking ? "cooking" : undefined}>
      <BookScene
        portrait={portrait}
        reduced={reduced}
        pageIndex={index}
        pageCount={portrait ? sheets.length : Math.ceil(sheets.length / 2)}
        turning={turning}
        canNext={index < maxIndex || Boolean(next)}
        canPrev={index > 0 || Boolean(previous)}
        onNext={() => commit("next")}
        onPrev={() => commit("prev")}
        onTurnEnd={finishTurn}
        live={portrait ? `עמוד ${index + 1} מתוך ${sheets.length}` : `גיליון ${index / 2 + 1}`}
        tabs={recipe.category ? [{ href: `/?category=${encodeURIComponent(recipe.category)}`, label: recipe.category }] : []}
        leafFront={turning === "next" ? <SheetView sheet={portrait ? right : left} recipe={recipe} /> : <SheetView sheet={right} recipe={recipe} />}
        leafBack={<SheetView sheet={turning === "next" ? (portrait ? incomingRight : incomingRight) : previousRight} recipe={recipe} />}
      >
        <article className="page" data-page="title" data-side="front">
          <button
            type="button"
            className="ribbon-mark"
            aria-pressed={favorite}
            aria-label={favorite ? "הסרה ממועדפים" : "סימון כמועדף"}
            onClick={() => {
              void api(`/api/recipes/${recipe.id}/favorite`, { method: "POST", body: JSON.stringify({ favorite: !favorite }) }).then(() =>
                setFavorite((value) => !value),
              );
            }}
          />
          <SheetView
            sheet={right}
            recipe={recipe}
            notes={notes}
            noteState={noteState}
            checked={checked}
            doneSteps={doneSteps}
            target={target}
            onTarget={setTarget}
            onToggleIng={(key) => setChecked((current) => ({ ...current, [key]: !current[key] }))}
            onToggleStep={(key) => setDoneSteps((current) => ({ ...current, [key]: !current[key] }))}
            onNote={() => setNoteOpen(true)}
            cooking={cooking}
            onCooking={() => setCooking((value) => !value)}
            doneCount={doneCount}
            totalSteps={totalSteps}
          />
        </article>
        <article className="page" data-page="method" data-side="back">
          {left ? (
            <SheetView
              sheet={left}
              recipe={recipe}
              notes={notes}
              noteState={noteState}
              checked={checked}
              doneSteps={doneSteps}
              target={target}
              onTarget={setTarget}
              onToggleIng={(key) => setChecked((current) => ({ ...current, [key]: !current[key] }))}
              onToggleStep={(key) => setDoneSteps((current) => ({ ...current, [key]: !current[key] }))}
              onNote={() => setNoteOpen(true)}
              cooking={cooking}
              onCooking={() => setCooking((value) => !value)}
              doneCount={doneCount}
              totalSteps={totalSteps}
            />
          ) : (
            <div className="blank-page">סוף הגיליון</div>
          )}
        </article>
      </BookScene>
      {noteOpen ? (
        <dialog className="note-dialog" open aria-labelledby="note-title">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void api(`/api/recipes/${recipe.id}/notes`, { method: "PATCH", body: JSON.stringify({ notes }) })
                .then(() => {
                  setNoteState("ההערה נשמרה.");
                  setNoteOpen(false);
                })
                .catch((reason: Error) => setNoteState(reason.message));
            }}
          >
            <h2 id="note-title">הערה בשוליים</h2>
            <label htmlFor="notes">הערות</label>
            <textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
            <div className="actions">
              <button className="button primary" type="submit">
                שמירת הערה
              </button>
              <button className="button quiet" type="button" onClick={() => setNoteOpen(false)}>
                ביטול
              </button>
            </div>
          </form>
        </dialog>
      ) : null}
      {noteState ? (
        <p className="status" role="status">
          {noteState}
        </p>
      ) : null}
    </div>
  );
}

function buildSheets(recipe: RecipeDTO, factor: number): Sheet[] {
  const ingredients: Ing[] = recipe.ingredientGroups.flatMap((group, groupIndex) =>
    group.items.map((item, index) => {
      const amount = formatAmount(scaleAmount(item.amount, factor), scaleAmount(item.amountMax, factor));
      const unit = item.unit ? ` ${item.unit}` : "";
      return {
        key: `${groupIndex}-${index}-${item.item}`,
        rawKey: `${groupIndex}-${index}`,
        amount: amount ? `${amount}${unit}` : item.unit,
        item: `${group.title ? `${group.title}: ` : ""}${item.item}${item.note ? ` — ${item.note}` : ""}${item.optional ? " (רשות)" : ""}${item.amount == null && factor !== 1 ? " · לא הוכפל" : ""}`,
        optional: item.optional,
      };
    }),
  );
  const steps: St[] = recipe.instructionGroups.flatMap((group, groupIndex) =>
    group.steps.map((step, index) => ({
      key: `${groupIndex}-${index}`,
      n: recipe.instructionGroups.slice(0, groupIndex).reduce((sum, item) => sum + item.steps.length, 0) + index + 1,
      text: `${group.title ? `${group.title} — ` : ""}${step.text}`,
    })),
  );
  const sheets: Sheet[] = [{ kind: "opening" }];
  chunk(ingredients, ING_PAGE).forEach((items, part) => {
    sheets.push({ kind: "ingredients", items, part: ingredients.length > ING_PAGE ? `${part + 1}` : "" });
  });
  chunk(steps, STEP_PAGE).forEach((items, part) => {
    sheets.push({ kind: "steps", items, part: steps.length > STEP_PAGE ? `${part + 1}` : "" });
  });
  sheets.push({ kind: "end" });
  return sheets;
}

function SheetView({
  sheet,
  recipe,
  notes,
  noteState,
  checked,
  doneSteps,
  target,
  onTarget,
  onToggleIng,
  onToggleStep,
  onNote,
  cooking,
  onCooking,
  doneCount,
  totalSteps,
}: {
  sheet: Sheet | undefined;
  recipe: RecipeDTO;
  notes?: string;
  noteState?: string | null;
  checked?: Record<string, boolean>;
  doneSteps?: Record<string, boolean>;
  target?: number;
  onTarget?: (value: number) => void;
  onToggleIng?: (key: string) => void;
  onToggleStep?: (key: string) => void;
  onNote?: () => void;
  cooking?: boolean;
  onCooking?: () => void;
  doneCount?: number;
  totalSteps?: number;
}) {
  if (!sheet) return null;
  if (sheet.kind === "opening") {
    const total = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
    return (
      <>
        <p className="kicker">{recipe.category ?? "מתכון"}</p>
        {recipe.isExample ? <p className="example-flag">מתכון לדוגמה — לא מתכון משפחתי אמיתי</p> : null}
        <h1 dir="auto">{recipe.title}</h1>
        <hr className="rule" />
        {recipe.intro ? <p className="prose" dir="auto">{recipe.intro}</p> : null}
        <div className="meta">
          {recipe.servingsText ? <span className="chip">{recipe.servingsText}</span> : null}
          {recipe.prepMinutes != null ? <span className="chip">הכנה {formatMinutes(recipe.prepMinutes)}</span> : null}
          {recipe.cookMinutes != null ? <span className="chip">בישול {formatMinutes(recipe.cookMinutes)}</span> : null}
          {recipe.prepMinutes != null && recipe.cookMinutes != null ? <span className="chip">יחד {formatMinutes(total)}</span> : null}
          {recipe.tags.map((tag) => (
            <Link key={tag} className="chip" href={`/?tag=${encodeURIComponent(tag)}`}>
              {tag}
            </Link>
          ))}
        </div>
        {recipe.photos[0] ? (
          <figure className="print">
            {/* Authenticated photo. The optimizer would cache it outside the session. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/photos/${recipe.photos[0].id}`} alt={recipe.photos[0].isSourceScan ? `צילום מקור של ${recipe.title}` : recipe.title} />
          </figure>
        ) : (
          <div className="monogram" aria-hidden="true">
            <span>{recipe.title.trim().slice(0, 1)}</span>
          </div>
        )}
        {notes ? <p className="source-line">הערה: {notes}</p> : null}
        <ul className="ing-list opening-ings">
          {recipe.ingredientGroups.flatMap((group) => group.items).slice(0, 4).map((item, index) => (
            <li key={`${item.item}-${index}`} className="ing" aria-hidden="true">
              <span className="qty" dir="ltr">{formatAmount(item.amount, item.amountMax) ?? ""}</span>
              <span>{item.item}</span>
            </li>
          ))}
        </ul>
        {recipe.servings && onTarget ? (
          <div className="servings" role="group" aria-label="התאמת מנות">
            <button type="button" aria-label="פחות מנות" onClick={() => onTarget(Math.max(1, (target ?? recipe.servings ?? 1) - 1))}>
              −
            </button>
            <strong>{target}</strong>
            <button type="button" aria-label="יותר מנות" onClick={() => onTarget((target ?? recipe.servings ?? 1) + 1)}>
              +
            </button>
          </div>
        ) : null}
        <div className="actions">
          <button className="button secondary" type="button" onClick={onCooking}>
            {cooking ? "חזרה לספר" : "במטבח"}
          </button>
          <Link className="button quiet" href={`/recipes/${recipe.id}/edit`}>
            עריכה
          </Link>
          <Link className="button quiet" href={`/recipes/${recipe.id}/history`}>
            גרסאות
          </Link>
        </div>
      </>
    );
  }
  if (sheet.kind === "ingredients") {
    return (
      <>
        <h2>רכיבים {sheet.part}</h2>
        <div className="progress" aria-hidden="true">
          {sheet.items.map((item) => (
            <i key={item.key} className={checked?.[item.key] ? "on" : undefined} />
          ))}
        </div>
        {sheet.items.length === 0 ? <p>לא צוינו רכיבים.</p> : null}
        <ul className="ing-list">
          {sheet.items.map((item) => (
            <li key={item.key}>
              <button type="button" className="ing" aria-pressed={Boolean(checked?.[item.key])} onClick={() => onToggleIng?.(item.key)}>
                <span className="mark">{checked?.[item.key] ? "✓" : ""}</span>
                <span className="qty" dir="ltr">{item.amount ?? ""}</span>
                <span className="name" dir="auto">{item.item}</span>
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }
  if (sheet.kind === "steps") {
    return (
      <>
        <h2>הכנה {sheet.part}</h2>
        <p className="prose">
          {doneCount ?? 0} מתוך {totalSteps ?? sheet.items.length} שלבים סומנו
        </p>
        <ol className="step-list">
          {sheet.items.map((item) => (
            <li key={item.key}>
              <button type="button" className="step" aria-pressed={Boolean(doneSteps?.[item.key])} onClick={() => onToggleStep?.(item.key)}>
                <span className="num">{item.n}</span>
                <span className="body" dir="auto">{item.text}</span>
              </button>
            </li>
          ))}
        </ol>
      </>
    );
  }
  return (
    <div className="note-block">
      <h2>בשוליים</h2>
      {notes ? <p dir="auto">{notes}</p> : <p>אין עדיין הערה בכתב יד.</p>}
      <button className="button secondary" type="button" onClick={onNote}>
        הערה
      </button>
      <p className="source-line">
        {recipe.sourceName ? `מקור: ${recipe.sourceName}. ` : ""}
        {recipe.sourceUrl ? (
          <a href={recipe.sourceUrl} rel="noreferrer noopener" target="_blank">
            קישור למקור
          </a>
        ) : null}
      </p>
    </div>
  );
}
