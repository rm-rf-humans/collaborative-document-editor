import type { AiProvider } from "./ai-provider.js";
import { MockAiProvider } from "./mock-ai-provider.js";
import { OpenAiSuggestionProvider } from "./openai-provider.js";

function normalizeProviderMode(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "openai" || normalized === "mock") {
    return normalized;
  }
  return "auto";
}

export function createAiProvider(): AiProvider {
  const mode = normalizeProviderMode(process.env.AI_PROVIDER);
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (mode === "openai" && !apiKey) {
    throw new Error("AI_PROVIDER is set to openai but OPENAI_API_KEY is missing.");
  }

  if (apiKey && mode !== "mock") {
    return new OpenAiSuggestionProvider({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL?.trim(),
      fastModel: process.env.OPENAI_FAST_MODEL?.trim() || "gpt-4.1-mini",
      qualityModel: process.env.OPENAI_QUALITY_MODEL?.trim() || "gpt-4.1"
    });
  }

  return new MockAiProvider();
}
