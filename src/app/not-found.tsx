import Link from "next/link";

export default function NotFound() {
  return (
    <main className="sheet">
      <h1>העמוד לא נמצא</h1>
      <p>יכול להיות שהמתכון נמחק, או שאין אליו גישה מהחשבון הזה.</p>
      <Link className="button primary" href="/">
        חזרה לתוכן
      </Link>
    </main>
  );
}
