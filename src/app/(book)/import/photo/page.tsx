import { ImportPhotoForm } from "@/components/book/import-forms";
import { extractionCapabilities } from "@/server/import/providers/registry";

export const dynamic = "force-dynamic";

export default function ImportPhotoPage() {
  const capabilities = extractionCapabilities();
  return (
    <article className="desk-sheet">
      <p className="kicker">ייבוא</p>
      <h1>מתמונה</h1>
      <p className="lede">
        מעלים צילום של מתכון מודפס או בכתב יד. הקובץ נבדק ומקודד מחדש. זיהוי טקסט רץ רק אם OpenRouter מוגדר עם מפתח ודגם. בלי זה לא
        נוצר מתכון ולא נשמרת תמונה.
      </p>
      <ImportPhotoForm configured={capabilities.vision} hint={capabilities.hint} />
    </article>
  );
}
