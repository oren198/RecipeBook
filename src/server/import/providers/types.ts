import type { RecipeInput } from "@/domain/recipe";

export type ProviderExtraction = {
  recipe: RecipeInput;
  warnings: string[];
};

export interface ExtractionProvider {
  readonly id: string;
  isConfigured(): boolean;
  configurationHint(): string;
  extractFromText(input: { url?: string; text: string }): Promise<ProviderExtraction>;
  extractFromImage(input: { bytes: Buffer; mediaType: "image/jpeg" }): Promise<ProviderExtraction>;
}
