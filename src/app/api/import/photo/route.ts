import { requireUser } from "@/server/auth/service";
import { importPhoto } from "@/server/import/service";
import { assertSameOrigin, clientIp, handle, json, readUploadedFile } from "@/server/http";

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser(req);
  const upload = await readUploadedFile(req);
  const draft = await importPhoto(user, upload.bytes, clientIp(req));
  return json({ draft }, 201);
});
