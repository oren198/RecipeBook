import { HttpError } from "@/domain/http";
import { requireUser } from "@/server/auth/service";
import { assertSameOrigin, handle, isUuid, json, readUploadedFile } from "@/server/http";
import { addRecipePhoto } from "@/server/recipes/service";

export const POST = handle(async (req, ctx) => {
  assertSameOrigin(req);
  const user = await requireUser(req);
  const id = (await ctx.params).id ?? "";
  if (!isUuid(id)) throw new HttpError(404, "not_found", "המתכון לא נמצא.");
  const upload = await readUploadedFile(req);
  return json({ recipe: await addRecipePhoto(user, id, upload.bytes, upload.caption) }, 201);
});
