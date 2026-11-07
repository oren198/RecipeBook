import { HttpError } from "@/domain/http";
import { getSql } from "@/server/db/client";

export async function consumeRateLimit(key: string, limit: number, windowMs: number): Promise<void> {
  const sql = getSql();
  const windowSeconds = windowMs / 1000;
  const rows = await sql<{ count: number }[]>`
    insert into rate_limits (key, window_start, count)
    values (${key.slice(0, 240)}, now(), 1)
    on conflict (key) do update set
      count = case
        when rate_limits.window_start <= now() - make_interval(secs => ${windowSeconds}) then 1
        else rate_limits.count + 1
      end,
      window_start = case
        when rate_limits.window_start <= now() - make_interval(secs => ${windowSeconds}) then now()
        else rate_limits.window_start
      end
    returning count
  `;
  const count = Number(rows[0]?.count ?? 0);
  if (count > limit) {
    throw new HttpError(429, "rate_limited", "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.");
  }
}
