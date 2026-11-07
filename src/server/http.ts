import { HttpError, isHttpError } from "@/domain/http";
import { ensureDatabase } from "@/server/db/client";

const PRIVATE_CACHE = "private, no-store";

export function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": PRIVATE_CACHE,
      "x-content-type-options": "nosniff",
      ...Object.fromEntries(new Headers(headers).entries()),
    },
  });
}

export function toErrorResponse(error: unknown): Response {
  if (isHttpError(error)) {
    return json(
      { error: { code: error.code, message: error.message, fields: error.fields ?? null } },
      error.status,
    );
  }
  const name = error instanceof Error ? error.name : "Error";
  console.error(`request failed: ${name}`);
  return json({ error: { code: "internal", message: "משהו השתבש. נסו שוב בעוד רגע.", fields: null } }, 500);
}

export function handle(fn: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      await ensureDatabase();
      return await fn(req, ctx);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > 1_000_000) {
    throw new HttpError(413, "too_large", "הבקשה גדולה מדי");
  }
  const text = await req.text();
  if (text.length > 1_000_000) {
    throw new HttpError(413, "too_large", "הבקשה גדולה מדי");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "invalid_json", "הבקשה אינה JSON תקין");
  }
}

export function clientIp(req: Request): string {
  if (process.env.TRUST_PROXY === "1") {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
      return forwarded.split(",")[0]?.trim().slice(0, 64) || "forwarded";
    }
  }
  const maybe = (req as Request & { ip?: string }).ip;
  if (maybe) return maybe.slice(0, 64);
  return "direct";
}

export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  const forwardedHost = process.env.TRUST_PROXY === "1" ? req.headers.get("x-forwarded-host") : null;
  const host = (forwardedHost || req.headers.get("host") || "").split(",")[0]?.trim();
  if (!origin || !host) {
    throw new HttpError(403, "bad_origin", "הבקשה נחסמה");
  }
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "bad_origin", "הבקשה נחסמה");
  }
  if (originHost !== host) {
    throw new HttpError(403, "bad_origin", "הבקשה נחסמה");
  }
}

export async function readUploadedFile(req: Request, field = "photo"): Promise<{ bytes: Buffer; caption: string | null }> {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > 9 * 1024 * 1024) {
    throw new HttpError(413, "too_large", "הקובץ גדול מדי.");
  }
  const form = await req.formData();
  const file = form.get(field);
  if (!(file instanceof File)) {
    throw new HttpError(400, "missing_file", "לא נבחר קובץ.");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new HttpError(413, "too_large", "התמונה גדולה מ-8MB.");
  }
  const captionValue = form.get("caption");
  const caption = typeof captionValue === "string" && captionValue.trim() ? captionValue.trim().slice(0, 200) : null;
  return { bytes: Buffer.from(await file.arrayBuffer()), caption };
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
