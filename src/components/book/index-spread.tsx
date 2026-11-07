"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ExampleButton } from "@/components/book/example-button";
import type { IndexRecipe } from "@/domain/recipe";
import { formatMinutes } from "@/lib/format";

export function IndexSpread({
  familyName,
  recipes,
  query,
  category,
  favoriteOnly,
}: {
  familyName: string;
  recipes: IndexRecipe[];
  query: string;
  category: string | null;
  favoriteOnly: boolean;
}) {
  const [opened, setOpened] = useState(Boolean(query || category || favoriteOnly));
  useEffect(() => {
    if (query || category || favoriteOnly) return;
    if (sessionStorage.getItem("book-open") === "1") queueMicrotask(() => setOpened(true));
  }, [query, category, favoriteOnly]);

  const categories = [...new Set(recipes.map((recipe) => recipe.category).filter((item): item is string => Boolean(item)))];
  const groups = new Map<string, IndexRecipe[]>();
  for (const recipe of recipes) {
    const key = recipe.category ?? "ללא פרק";
    groups.set(key, [...(groups.get(key) ?? []), recipe]);
  }

  if (!opened) {
    return (
      <div className="desk">
        <article className="closed-book" data-cover>
          <p className="cover-kicker">ספר מתכונים פרטי</p>
          <div>
            <h1 className="foil">{familyName}</h1>
            <p>המתכונים של הבית, בין שני לוחות.</p>
          </div>
          <button
            className="open-book"
            type="button"
            onClick={() => {
              sessionStorage.setItem("book-open", "1");
              setOpened(true);
            }}
          >
            פתיחת הספר
          </button>
        </article>
      </div>
    );
  }

  return (
    <div className="desk">
      <div className="volume" data-book data-layout="spread">
        <div className="board-edge" aria-hidden="true" />
        <div className="sheet-stack" aria-hidden="true" />
        <nav className="chapter-tabs" aria-label="פרקים">
          {categories.slice(0, 6).map((item) => (
            <a key={item} className="chapter-tab" href={`${favoriteOnly ? "/favorites" : "/"}?category=${encodeURIComponent(item)}`}>
              {item}
            </a>
          ))}
        </nav>
        <div className="spread" data-spread>
          <article className="page" data-page="title">
            <p className="kicker">{favoriteOnly ? "מועדפים" : "תוכן העניינים"}</p>
            <h1>{familyName}</h1>
            <hr className="rule" />
            <p className="lede">דפדפו בפרקים, או חפשו לפי שם, רכיב והערה. מתכוני הדוגמה מסומנים.</p>
            <form className="search" action={favoriteOnly ? "/favorites" : "/"} method="get" role="search">
              <label className="sr-only" htmlFor="q">
                חיפוש בספר
              </label>
              <input id="q" name="q" defaultValue={query} placeholder="חיפוש לפי שם, רכיב או הערה" />
              {category ? <input type="hidden" name="category" value={category} /> : null}
              <button className="button secondary" type="submit">
                חיפוש
              </button>
            </form>
            <p className="lede">{recipes.length === 0 ? "הספר עוד ריק." : `${recipes.length} מתכונים בספר הזה.`}</p>
          </article>
          <article className="page" data-page="method">
            <h2>תוכן</h2>
            {recipes.length === 0 ? (
              <div className="actions">
                <Link className="button primary" href="/recipes/new">
                  מתכון חדש
                </Link>
                <Link className="button secondary" href="/import">
                  ייבוא מקישור
                </Link>
                <ExampleButton />
              </div>
            ) : (
              [...groups.entries()].map(([name, items]) => (
                <section className="chapter" key={name}>
                  <h3>{name}</h3>
                  <ol className="toc">
                    {items.map((recipe) => (
                      <li key={recipe.id}>
                        <Link href={`/recipes/${recipe.id}`}>
                          <span className="toc-title" dir="auto">
                            {recipe.title}
                          </span>
                          <span className="leader" aria-hidden="true" />
                          <span>{formatMinutes((recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0)) ?? ""}</span>
                        </Link>
                        {recipe.isExample ? <span className="chip example-flag">דוגמה</span> : null}
                      </li>
                    ))}
                  </ol>
                </section>
              ))
            )}
          </article>
          <div className="gutter" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
