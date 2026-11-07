"use client";

import { useState } from "react";

import { api } from "@/lib/api";

export function RestoreButton({ recipeId, revisionId }: { recipeId: string; revisionId: string }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      className="button quiet"
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("לשחזר את הגרסה הזו? המצב הנוכחי יישמר לפני כן.")) return;
        setPending(true);
        void api(`/api/recipes/${recipeId}/restore`, { method: "POST", body: JSON.stringify({ revisionId }) })
          .then(() => {
            window.location.assign(`/recipes/${recipeId}`);
          })
          .catch(() => setPending(false));
      }}
    >
      שחזור
    </button>
  );
}
