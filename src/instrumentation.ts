export async function register() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }
  if (process.env.NODE_ENV === "production") {
    if (secret.includes("change-me") || secret.includes("replace-me") || secret.includes("test-session-secret")) {
      throw new Error("SESSION_SECRET is a placeholder");
    }
    if ((process.env.SETUP_SECRET?.trim().length ?? 0) < 16) {
      throw new Error("SETUP_SECRET must be set in production");
    }
  }
  const { migrateDatabase } = await import("@/server/db/migrate");
  await migrateDatabase();
}
