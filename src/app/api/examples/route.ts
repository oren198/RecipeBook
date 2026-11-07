import { requireUser } from "@/server/auth/service";
import { assertSameOrigin, handle, json } from "@/server/http";
import { insertExamples } from "@/server/recipes/service";

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser(req);
  const added = await insertExamples(user);
  return json({ added });
});
