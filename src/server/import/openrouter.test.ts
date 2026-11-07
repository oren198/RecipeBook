import { describe, expect, it, vi } from "vitest";

import { createOpenRouterProvider, readOpenRouterConfig } from "@/server/import/providers/openrouter";

const validRecipe = {
  title: "מתכון מצולם",
  intro: null,
  servingsText: "4",
  prepTimeText: "10 דקות",
  cookTimeText: null,
  category: null,
  tags: ["בית"],
  notes: null,
  sourceName: null,
  ingredientGroups: [
    {
      title: null,
      items: [{ amountText: "1", unit: "כף", item: "שמן", note: null, optional: false, uncertain: true }],
    },
  ],
  instructionGroups: [{ title: null, steps: [{ text: "לחמם", uncertain: false }] }],
  warnings: ["הכמות מטושטשת"],
};

const env = {
  RECIPE_EXTRACT_PROVIDER: "openrouter",
  OPENROUTER_API_KEY: "sk-or-v1-test-key-not-real-000000",
  OPENROUTER_MODEL: "example/vision-model",
  OPENROUTER_MAX_TOKENS: "9000",
  OPENROUTER_TIMEOUT_MS: "90000",
};

describe("openrouter configuration", () => {
  it("stays unconfigured without a key or model and does not call the network", async () => {
    const fetchImpl = vi.fn(() => {
      throw new Error("network should not be called");
    });
    const provider = createOpenRouterProvider({
      env: { RECIPE_EXTRACT_PROVIDER: "openrouter" },
      fetchImpl,
    });
    expect(provider.isConfigured()).toBe(false);
    await expect(provider.extractFromImage({ bytes: Buffer.from("x"), mediaType: "image/jpeg" })).rejects.toMatchObject({
      code: "vision_not_configured",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readOpenRouterConfig({ RECIPE_EXTRACT_PROVIDER: "none" }).ok).toBe(false);
    expect(readOpenRouterConfig({ ...env, OPENROUTER_API_KEY: "changeme" }).ok).toBe(false);
    expect(readOpenRouterConfig({ ...env, OPENROUTER_BASE_URL: "http://169.254.169.254/api" }).ok).toBe(false);
  });

  it("sends a strict schema, capped tokens, and the image after the text", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("example/vision-model");
      expect(body.max_tokens).toBe(4096);
      expect(body.stream).toBe(false);
      expect(body.response_format.json_schema.strict).toBe(true);
      expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
      expect(body.provider.require_parameters).toBe(true);
      const parts = body.messages[0].content;
      expect(parts[0].type).toBe("text");
      expect(parts[1].type).toBe("image_url");
      expect(parts[1].image_url.url.startsWith("data:image/jpeg;base64,")).toBe(true);
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer sk-or-v1-test-key-not-real-000000");
      expect(String(init?.body)).not.toContain("sk-or-v1-test-key-not-real-000000");
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validRecipe) } }] }), { status: 200 });
    });
    const provider = createOpenRouterProvider({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await provider.extractFromImage({ bytes: Buffer.from("jpeg-bytes"), mediaType: "image/jpeg" });
    expect(result.recipe.title).toBe("מתכון מצולם");
    expect(result.recipe.ingredientGroups[0]?.items[0]?.item).toBe("שמן");
    expect(result.warnings.some((warning) => warning.includes("לא ודאי") || warning.includes("מטושטשת"))).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects an invalid provider payload and an oversized image before fetch", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"title":' } }] }), { status: 200 }));
    const provider = createOpenRouterProvider({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider.extractFromText({ text: "טקסט ארוך מספיק כדי לנסות חילוץ של מתכון משפחתי" })).rejects.toMatchObject({
      code: "provider_invalid",
    });
    const huge = createOpenRouterProvider({ env, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(huge.extractFromImage({ bytes: Buffer.alloc(3_600_000, 1), mediaType: "image/jpeg" })).rejects.toMatchObject({
      code: "image_too_large_for_provider",
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

