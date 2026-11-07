"use client";

import { useState } from "react";

import { api, ApiError } from "@/lib/api";

export function ImportUrlForm() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form
      className="field"
      onSubmit={(event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        void api<{ draft: { id: string } }>("/api/import/url", { method: "POST", body: JSON.stringify({ url }) })
          .then((result) => {
            window.location.assign(`/import/review/${result.draft.id}`);
          })
          .catch((reason: Error) => {
            setError(reason.message);
            setPending(false);
          });
      }}
    >
      <label htmlFor="source-url">כתובת</label>
      <input id="source-url" type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" />
      <button className="button primary" type="submit" disabled={pending}>
        {pending ? "שולפים…" : "שליפת מתכון"}
      </button>
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function ImportPhotoForm({ configured, hint }: { configured: boolean; hint: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form
      className="field"
      onSubmit={(event) => {
        event.preventDefault();
        if (!configured) return;
        const data = new FormData(event.currentTarget);
        setPending(true);
        setError(null);
        void fetch("/api/import/photo", { method: "POST", body: data })
          .then(async (response) => {
            const body = (await response.json().catch(() => null)) as {
              draft?: { id: string };
              error?: { message?: string; code?: string };
            } | null;
            if (!response.ok || !body?.draft) {
              throw new ApiError(response.status, body?.error?.code ?? "error", body?.error?.message ?? "הייבוא נכשל");
            }
            window.location.assign(`/import/review/${body.draft.id}`);
          })
          .catch((reason: Error) => {
            setError(reason.message);
            setPending(false);
          });
      }}
    >
      <p className={configured ? "status" : "callout"} role="status">
        {hint}
      </p>
      <label htmlFor="photo">צילום המתכון</label>
      <input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={!configured} required={configured} />
      <button className="button primary" type="submit" disabled={!configured || pending}>
        {configured ? (pending ? "שולחים לזיהוי…" : "זיהוי וטיוטה") : "הזיהוי לא מוגדר"}
      </button>
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
