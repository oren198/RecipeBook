"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { api } from "@/lib/api";
import type { CurrentUser } from "@/server/auth/types";

export function BookShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  return (
    <div className="stage">
      <a className="skip" href="#content">
        דלג לתוכן
      </a>
      <header className="mast">
        <Link className="brand" href="/">
          {user.familyName}
        </Link>
        <nav aria-label="ניווט הספר">
          <Link href="/">תוכן</Link>
          <Link href="/favorites">מועדפים</Link>
          <Link href="/import">ייבוא מקישור</Link>
          <Link href="/import/photo">ייבוא מתמונה</Link>
          <Link href="/recipes/new">מתכון חדש</Link>
          <LogoutButton />
        </nav>
      </header>
      <div id="content" className="stage-main">
        {children}
      </div>
      <nav className="dock" aria-label="ניווט מהיר">
        <Link href="/">תוכן</Link>
        <Link href="/favorites">מועדפים</Link>
        <Link href="/import">ייבוא</Link>
        <Link href="/recipes/new">חדש</Link>
      </nav>
    </div>
  );
}

function LogoutButton() {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void api("/api/auth/logout", { method: "POST" })
          .then(() => {
            window.location.assign("/login");
          })
          .catch(() => setPending(false));
      }}
    >
      יציאה
    </button>
  );
}
