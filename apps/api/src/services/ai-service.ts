import type { AiFeature, AiInteraction, AiProviderStatus, SelectionRange } from "@midterm/shared";
import { DocumentService } from "./document-service.js";
import type { AiProvider } from "./ai-provider.js";

type AiCompletedCallback = (documentId: string, interaction: AiInteraction) => void;

export class AiService {
  constructor(
    private readonly documents: DocumentService,
    private readonly provider: AiProvider,
    private readonly onCompleted: AiCompletedCallback
  ) {}

  getProviderStatus(): AiProviderStatus {
    return this.provider.getStatus();
  }

  request(documentId: string, userId: string, feature: AiFeature, selection: SelectionRange, targetLanguage?: string) {
    const metadata = this.provider.getRequestMetadata(feature);
    const { document, interaction } = this.documents.requestAi(documentId, userId, feature, selection, metadata, targetLanguage);

    if (interaction.status === "quota_exceeded") {
      return interaction;
    }

    void this.completeQueuedInteraction(documentId, document.title, document.content, interaction, targetLanguage);

    return interaction;
  }

  private async completeQueuedInteraction(
    documentId: string,
    documentTitle: string,
    documentContent: string,
    interaction: AiInteraction,
    targetLanguage?: string
  ) {
    try {
      const suggestion = await this.provider.generateSuggestion({
        feature: interaction.feature,
        documentTitle,
        documentContent,
        selection: interaction.selection,
        sourceText: interaction.sourceText,
        targetLanguage
      });
      const completedInteraction = this.documents.completeAi(documentId, interaction.id, suggestion.suggestedText, "completed");
      this.onCompleted(documentId, completedInteraction);
    } catch (error) {
      const message = error instanceof Error
        ? `The AI provider failed to complete this request: ${error.message}`
        : "The AI provider failed to complete this request.";
      const failedInteraction = this.documents.completeAi(documentId, interaction.id, message, "failed");
      this.onCompleted(documentId, failedInteraction);
    }
  }
}
