"use client";

import { useState } from "react";

import { api, safeNext } from "@/lib/api";

export function LoginForm({ next, setupOpen }: { next: string; setupOpen: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <div className="cover-scene">
    <form
      className="clasp"
      method="post"
      action="/login"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setPending(true);
        setError(null);
        void api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ username: data.get("username"), password: data.get("password") }),
        })
          .then(() => {
            window.location.assign(safeNext(next));
          })
          .catch((reason: Error) => {
            setError(reason.message);
            setPending(false);
          });
      }}
    >
      <p className="kicker">ספר מתכונים פרטי</p>
      <h1>כניסה</h1>
      <p className="lede">הספר משותף לבית. אין הרשמה פתוחה אחרי ההקמה הראשונה.</p>
      <label className="field">
        שם משתמש
        <input name="username" autoComplete="username" required />
      </label>
      <label className="field">
        סיסמה
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
      <button className="button primary" type="submit" disabled={pending}>
        {pending ? "נכנסים…" : "כניסה"}
      </button>
      {setupOpen ? (
        <p>
          <a href="/setup">הספר עדיין לא הוקם</a>
        </p>
      ) : null}
    </form>
    </div>
  );
}

export function SetupForm({ productionSecretRequired }: { productionSecretRequired: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <div className="cover-scene">
    <form
      className="clasp"
      method="post"
      action="/setup"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setPending(true);
        setError(null);
        void api("/api/auth/setup", {
          method: "POST",
          body: JSON.stringify({
            familyName: data.get("familyName"),
            username: data.get("username"),
            password: data.get("password"),
            setupSecret: data.get("setupSecret") || null,
          }),
        })
          .then(() => {
            window.location.assign("/");
          })
          .catch((reason: Error) => {
            setError(reason.message);
            setPending(false);
          });
      }}
    >
      <p className="kicker">הקמה חד-פעמית</p>
      <h1>פתיחת הספר</h1>
      <p className="lede">נוצר חשבון בית אחד. אחר כך אין הרשמה ציבורית. בחרו סיסמה משלכם. אין סיסמת ברירת מחדל.</p>
      {productionSecretRequired ? (
        <p className="alert" role="alert">
          בשרת חסר SETUP_SECRET. ההקמה חסומה עד שהמפעיל מגדיר אותו מחוץ לקוד.
        </p>
      ) : (
        <p className="callout">בפיתוח מקומי אין חובת סוד הקמה. בייצור צריך SETUP_SECRET.</p>
      )}
      <label className="field">
        שם הספר
        <input name="familyName" required minLength={2} maxLength={80} />
      </label>
      <label className="field">
        שם משתמש
        <input name="username" autoComplete="username" required minLength={3} maxLength={40} />
      </label>
      <label className="field">
        סיסמה
        <input name="password" type="password" autoComplete="new-password" required minLength={10} />
      </label>
      <label className="field">
        סוד הקמה, אם הוגדר בשרת
        <input name="setupSecret" type="password" autoComplete="off" />
      </label>
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
      <button className="button primary" type="submit" disabled={pending || productionSecretRequired}>
        {pending ? "יוצרים…" : "יצירת הספר"}
      </button>
    </form>
    </div>
  );
}
