import type { AiFeature, AiProviderStatus, SelectionRange } from "@midterm/shared";

export type AiRequestMetadata = {
  model: string;
  promptTemplateVersion: string;
};

export type GenerateSuggestionInput = {
  feature: AiFeature;
  documentTitle: string;
  documentContent: string;
  selection: SelectionRange;
  sourceText: string;
  targetLanguage?: string;
};

export type GenerateSuggestionResult = {
  suggestedText: string;
};

export interface AiProvider {
  getStatus(): AiProviderStatus;
  getRequestMetadata(feature: AiFeature): AiRequestMetadata;
  generateSuggestion(input: GenerateSuggestionInput): Promise<GenerateSuggestionResult>;
}

export function selectModelForFeature(feature: AiFeature, fastModel: string, qualityModel: string) {
  switch (feature) {
    case "summarize":
    case "translate":
    case "proofread":
    case "complete":
      return fastModel;
    case "rewrite":
    case "restructure":
    default:
      return qualityModel;
  }
}

export function extractContextWindow(content: string, selection: SelectionRange, beforeSize = 900, afterSize = 450) {
  const beforeStart = Math.max(0, selection.start - beforeSize);
  const afterEnd = Math.min(content.length, selection.end + afterSize);

  return {
    before: content.slice(beforeStart, selection.start),
    selected: content.slice(selection.start, selection.end),
    after: content.slice(selection.end, afterEnd)
  };
}
