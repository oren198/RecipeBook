import { ImportUrlForm } from "@/components/book/import-forms";
import { extractionCapabilities } from "@/server/import/providers/registry";

export const dynamic = "force-dynamic";

export default function ImportUrlPage() {
  const capabilities = extractionCapabilities();
  return (
    <article className="desk-sheet">
      <p className="kicker">ייבוא</p>
      <h1>מקישור</h1>
      <p className="lede">
        קודם נקרא סימון schema.org Recipe מתוך העמוד, בלי מפתח בתשלום. אם אין סימון מובנה, חילוץ טקסט חופשי רץ רק כשספק מוגדר. לא
        ממציאים מתכון.
      </p>
      <p className="callout">ייבוא מובנה לא נדרש מפתח. {capabilities.hint}</p>
      <ImportUrlForm />
    </article>
  );
}
