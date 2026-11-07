import { z } from "zod";

import { HttpError } from "@/domain/http";
import { requireUser } from "@/server/auth/service";
import { assertSameOrigin, handle, isUuid, json, readJson } from "@/server/http";
import { updateNotes } from "@/server/recipes/service";

const notesSchema = z.object({
  notes: z.union([z.string().trim().max(10000), z.null()]).transform((value) => (value == null || value.length === 0 ? null : value)),
});

export const PATCH = handle(async (req, ctx) => {
  assertSameOrigin(req);
  const user = await requireUser(req);
  const id = (await ctx.params).id ?? "";
  if (!isUuid(id)) throw new HttpError(404, "not_found", "המתכון לא נמצא.");
  const parsed = notesSchema.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, "invalid", "ההערה ארוכה מדי.");
  return json({ recipe: await updateNotes(user, id, parsed.data.notes) });
});
