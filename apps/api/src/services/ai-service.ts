import type { AiFeature, AiInteraction, SelectionRange } from "@midterm/shared";
import { DocumentService } from "./document-service.js";

type AiCompletedCallback = (documentId: string, interaction: AiInteraction) => void;

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildSuggestion(feature: AiFeature, sourceText: string, targetLanguage?: string) {
  const normalized = sourceText.trim();
  if (!normalized) {
    return "No text was selected. Ask the user to highlight a section before invoking the AI assistant.";
  }

  switch (feature) {
    case "rewrite":
      return `${capitalize(normalized.replace(/\s+/g, " "))}. This version tightens the wording, keeps the intent, and makes the section easier to scan.`;
    case "summarize":
      return `Summary: ${normalized.split(/[.!?]/).map((segment) => segment.trim()).filter(Boolean).slice(0, 2).join("; ")}.`;
    case "translate":
      return `Translated to ${targetLanguage ?? "the requested language"}: ${normalized}`;
    case "restructure":
      return normalized
        .split(/\n+/)
        .map((line, index) => `${index + 1}. ${line.replace(/^#+\s*/, "").trim()}`)
        .join("\n");
    default:
      return normalized;
  }
}

export class AiService {
  constructor(
    private readonly documents: DocumentService,
    private readonly onCompleted: AiCompletedCallback
  ) {}

  request(documentId: string, userId: string, feature: AiFeature, selection: SelectionRange, targetLanguage?: string) {
    const interaction = this.documents.requestAi(documentId, userId, feature, selection, targetLanguage);

    if (interaction.status === "quota_exceeded") {
      return interaction;
    }

    setTimeout(() => {
      const suggestion = buildSuggestion(feature, interaction.sourceText, targetLanguage);
      const completedInteraction = this.documents.completeAi(documentId, interaction.id, suggestion, "completed");
      this.onCompleted(documentId, completedInteraction);
    }, 1200);

    return interaction;
  }
}
