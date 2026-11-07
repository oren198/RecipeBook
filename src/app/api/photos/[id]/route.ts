import { HttpError } from "@/domain/http";
import { requireUser } from "@/server/auth/service";
import { assertSameOrigin, handle, isUuid } from "@/server/http";
import { readPhoto, removePhoto } from "@/server/recipes/service";

export const GET = handle(async (req, ctx) => {
  const user = await requireUser(req);
  const id = (await ctx.params).id ?? "";
  if (!isUuid(id)) throw new HttpError(404, "not_found", "התמונה לא נמצאה.");
  const photo = await readPhoto(user, id);
  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "content-type": photo.contentType,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-disposition": 'inline; filename="recipe.jpg"',
    },
  });
});

export const DELETE = handle(async (req, ctx) => {
  assertSameOrigin(req);
  const user = await requireUser(req);
  const id = (await ctx.params).id ?? "";
  if (!isUuid(id)) throw new HttpError(404, "not_found", "התמונה לא נמצאה.");
  await removePhoto(user, id);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" },
  });
});
