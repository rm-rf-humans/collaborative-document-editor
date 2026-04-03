import type { AiFeature, AiProviderStatus } from "@midterm/shared";
import { extractContextWindow, selectModelForFeature, type AiProvider, type GenerateSuggestionInput, type GenerateSuggestionResult } from "./ai-provider.js";

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function buildMockSuggestion(feature: AiFeature, input: GenerateSuggestionInput) {
  const normalized = collapseWhitespace(input.sourceText);
  if (!normalized && feature !== "complete") {
    return "No text was selected. Highlight a section before invoking this writing workflow.";
  }

  switch (feature) {
    case "rewrite":
      return `${capitalize(normalized)}. This revision tightens the wording, preserves intent, and improves readability.`;
    case "summarize":
      return `Summary: ${normalized.split(/[.!?]/).map((segment) => segment.trim()).filter(Boolean).slice(0, 2).join("; ")}.`;
    case "translate":
      return `Translated to ${input.targetLanguage ?? "the requested language"}: ${normalized}`;
    case "restructure":
      return normalized
        .split(/\n+/)
        .map((line, index) => `${index + 1}. ${line.replace(/^#+\s*/, "").trim()}`)
        .join("\n");
    case "proofread":
      return capitalize(normalized.replace(/\bi\b/g, "I").replace(/\s+([,.;:!?])/g, "$1"));
    case "complete": {
      const context = extractContextWindow(input.documentContent, input.selection);
      const anchor = collapseWhitespace(context.before).split(/[.!?]/).filter(Boolean).at(-1) ?? input.documentTitle;
      return ` ${capitalize(anchor.slice(0, 80))} should now transition into the execution plan, the key dependencies, and the success criteria for launch readiness.`;
    }
    default:
      return normalized;
  }
}

export class MockAiProvider implements AiProvider {
  private readonly status: AiProviderStatus = {
    mode: "mock",
    live: false,
    fastModel: "mock-fast-writer",
    qualityModel: "mock-quality-writer",
    message: "Mock AI fallback is active. Set OPENAI_API_KEY to use live model-backed suggestions."
  };

  getStatus() {
    return this.status;
  }

  getRequestMetadata(feature: AiFeature) {
    return {
      model: selectModelForFeature(feature, this.status.fastModel, this.status.qualityModel),
      promptTemplateVersion: "mock-v2"
    };
  }

  async generateSuggestion(input: GenerateSuggestionInput): Promise<GenerateSuggestionResult> {
    return {
      suggestedText: buildMockSuggestion(input.feature, input)
    };
  }
}
