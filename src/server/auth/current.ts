import { cookies } from "next/headers";

import { userFromToken } from "@/server/auth/service";
import { SESSION_COOKIE } from "@/server/auth/session";
import type { CurrentUser } from "@/server/auth/types";
import { ensureDatabase } from "@/server/db/client";

export async function getCurrentUser(): Promise<CurrentUser | null> {
  await ensureDatabase();
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value);
}
