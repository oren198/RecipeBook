import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Frank_Ruhl_Libre, Heebo } from "next/font/google";

import "./globals.css";

const display = Frank_Ruhl_Libre({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "700"],
  variable: "--font-frank",
});

const sans = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "700"],
  variable: "--font-heebo",
});

export const metadata: Metadata = {
  title: { default: "ספר המתכונים", template: "%s · ספר המתכונים" },
  description: "ספר מתכונים פרטי לבית",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${display.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
