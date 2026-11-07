import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { HttpError } from "@/domain/http";

export function uploadRoot(): string {
  return path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR || "./data/uploads");
}

export function resolveStoragePath(root: string, storageKey: string): string {
  if (!storageKey || storageKey.includes("\0")) {
    throw new HttpError(400, "bad_path", "נתיב קובץ לא תקין");
  }
  const segments = storageKey.split(/[\\/]/);
  if (path.isAbsolute(storageKey) || segments.includes("..") || segments.includes(".")) {
    throw new HttpError(400, "bad_path", "נתיב קובץ לא תקין");
  }
  const rootResolved = path.resolve(root);
  const full = path.resolve(rootResolved, storageKey);
  if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) {
    throw new HttpError(400, "bad_path", "נתיב קובץ לא תקין");
  }
  return full;
}

export async function writeStoredFile(storageKey: string, bytes: Buffer): Promise<void> {
  const full = resolveStoragePath(uploadRoot(), storageKey);
  await mkdir(/* turbopackIgnore: true */ path.dirname(full), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ full, bytes, { flag: "wx" });
}

export async function readStoredFile(storageKey: string): Promise<Buffer> {
  const full = resolveStoragePath(uploadRoot(), storageKey);
  return readFile(/* turbopackIgnore: true */ full);
}

export async function removeStoredFile(storageKey: string): Promise<void> {
  const full = resolveStoragePath(uploadRoot(), storageKey);
  await rm(/* turbopackIgnore: true */ full, { force: true });
}
