import { selectionToText, type ApplyAiSuggestionRequest, type ShareDocumentRequest } from "@midterm/shared";
import { InMemoryStore } from "../repositories/in-memory-store.js";
import type { Document } from "@midterm/shared";
import type { AiRequestMetadata } from "./ai-provider.js";

function buildInteractionSourceText(document: Document, selection: { start: number; end: number }, feature: "complete" | Parameters<InMemoryStore["requestAiInteraction"]>[2]) {
  if (feature === "complete") {
    return `Cursor at character ${selection.start}. Generate a continuation that fits the surrounding draft.`;
  }

  return selectionToText(document.content, selection);
}

export class DocumentService {
  constructor(private readonly store: InMemoryStore) {}

  listDocuments(userId: string) {
    return this.store.listDocumentsForUser(userId);
  }

  createDocument(userId: string, title: string, content: string) {
    return this.store.createDocument(userId, title, content);
  }

  getDocument(documentId: string, userId: string) {
    return this.store.getDocumentForUser(documentId, userId).document;
  }

  updateContent(documentId: string, userId: string, baseVersion: number, content: string, reason: string) {
    return this.store.updateDocumentContent(documentId, userId, baseVersion, content, reason);
  }

  applyRealtimeChange(documentId: string, userId: string, baseVersion: number, content: string) {
    return this.store.applyRealtimeChange(documentId, userId, baseVersion, content);
  }

  listVersions(documentId: string, userId: string) {
    return this.store.listVersions(documentId, userId);
  }

  revert(documentId: string, userId: string, versionNumber: number) {
    return this.store.revertDocument(documentId, userId, versionNumber);
  }

  listPermissions(documentId: string, userId: string) {
    return this.store.listPermissions(documentId, userId);
  }

  share(documentId: string, userId: string, request: ShareDocumentRequest) {
    return this.store.shareDocument(documentId, userId, request);
  }

  requestAi(documentId: string, userId: string, feature: Parameters<InMemoryStore["requestAiInteraction"]>[2], selection: Parameters<InMemoryStore["requestAiInteraction"]>[3], metadata: AiRequestMetadata, targetLanguage?: string) {
    const document = this.getDocument(documentId, userId);
    const interaction = this.store.requestAiInteraction(
      documentId,
      userId,
      feature,
      selection,
      buildInteractionSourceText(document, selection, feature),
      metadata,
      targetLanguage
    );

    return { document, interaction };
  }

  completeAi(documentId: string, interactionId: string, suggestedText: string, status: Parameters<InMemoryStore["completeAiInteraction"]>[3]) {
    return this.store.completeAiInteraction(documentId, interactionId, suggestedText, status);
  }

  listAiInteractions(documentId: string, userId: string) {
    return this.store.listAiInteractions(documentId, userId);
  }

  applyAiSuggestion(documentId: string, interactionId: string, userId: string, request: ApplyAiSuggestionRequest) {
    return this.store.applyAiSuggestion(documentId, interactionId, userId, request);
  }

  rejectAiSuggestion(documentId: string, interactionId: string, userId: string) {
    return this.store.rejectAiSuggestion(documentId, interactionId, userId);
  }

  setActiveCollaboratorCount(documentId: string, participants: Parameters<InMemoryStore["setActiveCollaboratorCount"]>[1]) {
    this.store.setActiveCollaboratorCount(documentId, participants);
  }
}
