import { createOpenRouterProvider, readOpenRouterConfig, unconfiguredProvider } from "@/server/import/providers/openrouter";
import type { ExtractionProvider } from "@/server/import/providers/types";

export function getExtractionProvider(env: Record<string, string | undefined> = process.env): ExtractionProvider {
  const selected = (env.RECIPE_EXTRACT_PROVIDER ?? "none").trim().toLowerCase();
  if (selected === "" || selected === "none") return unconfiguredProvider;
  if (selected === "openrouter") return createOpenRouterProvider({ env });
  return {
    id: selected,
    isConfigured: () => false,
    configurationHint: () => `ספק לא מוכר (${selected}). לא נשלחת קריאה. ראו docs/IMPORT_PROVIDERS.md`,
    async extractFromText() {
      throw new Error("unreachable");
    },
    async extractFromImage() {
      throw new Error("unreachable");
    },
  };
}

export function extractionCapabilities(env: Record<string, string | undefined> = process.env) {
  const provider = getExtractionProvider(env);
  const configured = provider.isConfigured();
  return {
    structuredJsonLd: true,
    unstructuredText: configured,
    vision: configured,
    providerId: provider.id,
    hint: provider.id === "openrouter" ? readOpenRouterConfig(env).hint : provider.configurationHint(),
  };
}
