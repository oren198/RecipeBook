"use client";

import { useState } from "react";

import { api } from "@/lib/api";

export function ExampleButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <>
      <button
        className="button quiet"
        type="button"
        disabled={pending}
        onClick={() => {
          setPending(true);
          void api<{ added: number }>("/api/examples", { method: "POST" })
            .then((result) => {
              setMessage(result.added ? "נוספו מתכוני דוגמה מסומנים." : "מתכוני הדוגמה כבר בספר.");
              window.location.assign("/");
            })
            .catch((error: Error) => {
              setMessage(error.message);
              setPending(false);
            });
        }}
      >
        טעינת מתכוני דוגמה
      </button>
      {message ? (
        <p className="status" role="status">
          {message}
        </p>
      ) : null}
    </>
  );
}
