import { ensureDatabase, getSql } from "@/server/db/client";
import { json } from "@/server/http";

export async function GET() {
  try {
    await ensureDatabase();
    await getSql()`select 1`;
    return json({ ok: true });
  } catch {
    return json({ ok: false }, 503);
  }
}
