import { requireUser } from "@/server/auth/service";
import { handle, json } from "@/server/http";

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  return json({ user });
});
