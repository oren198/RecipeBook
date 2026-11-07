import sharp from "sharp";

import { HttpError } from "@/domain/http";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_PROVIDER_BYTES = 3_500_000;

export function hasImageMagic(bytes: Buffer): boolean {
  if (bytes.length < 12) return false;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.subarray(0, 8).equals(png)) return true;
  const gif = bytes.subarray(0, 6).toString("ascii");
  if (gif === "GIF87a" || gif === "GIF89a") return true;
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return true;
  return false;
}

export async function reencodeUpload(bytes: Buffer): Promise<{ jpeg: Buffer; width: number; height: number }> {
  if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) {
    throw new HttpError(413, "too_large", "התמונה גדולה מ-8MB.");
  }
  if (!hasImageMagic(bytes)) {
    throw new HttpError(400, "not_image", "אפשר להעלות רק תמונת JPEG, PNG, WEBP או GIF.");
  }
  try {
    const image = sharp(bytes, {
      failOn: "error",
      limitInputPixels: 20_000_000,
      animated: false,
      pages: 1,
    });
    const meta = await image.metadata();
    if (!meta.format || !["jpeg", "png", "webp", "gif", "tiff"].includes(meta.format)) {
      throw new HttpError(400, "not_image", "סוג התמונה אינו נתמך.");
    }
    const jpeg = await image
      .rotate()
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    const out = await sharp(jpeg).metadata();
    if (!jpeg.length || !out.width || !out.height) {
      throw new HttpError(400, "not_image", "לא הצלחנו לקרוא את התמונה.");
    }
    return { jpeg, width: out.width, height: out.height };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "not_image", "הקובץ אינו תמונה תקינה.");
  }
}

export async function jpegForProvider(jpeg: Buffer): Promise<Buffer> {
  let quality = 80;
  let edge = 1600;
  let out = jpeg;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    out = await sharp(jpeg)
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    if (out.length <= MAX_PROVIDER_BYTES) return out;
    quality -= 15;
    edge = Math.round(edge * 0.75);
  }
  throw new HttpError(413, "image_too_large_for_provider", "התמונה גדולה מדי לשליחה לספק הזיהוי. לא נשלחה קריאה.");
}
