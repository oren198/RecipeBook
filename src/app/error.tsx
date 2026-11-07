"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="sheet">
      <h1>משהו השתבש</h1>
      <p>אפשר לנסות שוב. אם המתכון לא נשמר, הטופס שומר טיוטה מקומית.</p>
      <button className="button primary" type="button" onClick={() => reset()}>
        ניסיון נוסף
      </button>
    </main>
  );
}
