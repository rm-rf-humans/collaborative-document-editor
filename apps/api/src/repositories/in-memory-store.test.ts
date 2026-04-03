import { describe, expect, it } from "vitest";
import { InMemoryStore } from "./in-memory-store.js";
import { AppError } from "../utils/errors.js";

function getSeedDocumentId(store: InMemoryStore, userId = "user-layla") {
  return store.listDocumentsForUser(userId)[0]!.id;
}

function captureAppError(action: () => unknown) {
  try {
    action();
  } catch (error) {
    if (error instanceof AppError) {
      return error;
    }
    throw error;
  }

  throw new Error("Expected the action to throw an AppError.");
}

describe("InMemoryStore", () => {
  it("updates an existing user permission in place instead of duplicating it", () => {
    const store = new InMemoryStore();
    const documentId = getSeedDocumentId(store);

    store.shareDocument(documentId, "user-layla", {
      principalType: "user",
      principalId: "user-mona",
      role: "editor",
      allowAi: true
    });

    const updatedPermissions = store.listPermissions(documentId, "user-layla")
      .filter((permission) => permission.principalId === "user-mona");

    expect(updatedPermissions).toHaveLength(1);
    expect(updatedPermissions[0]?.role).toBe("editor");
    expect(updatedPermissions[0]?.allowAi).toBe(true);
  });

  it("creates a new audit version when reverting to a previous snapshot", () => {
    const store = new InMemoryStore();
    const documentId = getSeedDocumentId(store);
    const originalContent = store.getDocumentForUser(documentId, "user-layla").document.content;

    store.updateDocumentContent(documentId, "user-layla", 1, "Version 2 body", "Revise summary");
    store.updateDocumentContent(documentId, "user-layla", 2, "Version 3 body", "Revise rollout");

    const result = store.revertDocument(documentId, "user-layla", 1);

    expect(result.document.content).toBe(originalContent);
    expect(result.document.currentVersion).toBe(4);
    expect(result.savedVersion.versionNumber).toBe(4);
    expect(result.savedVersion.reason).toBe("Reverted to v1");
  });

  it("rejects AI requests for principals that do not have AI access", () => {
    const store = new InMemoryStore();
    const documentId = getSeedDocumentId(store, "user-mona");

    const error = captureAppError(() => {
      store.requestAiInteraction(
        documentId,
        "user-mona",
        "summarize",
        { start: 0, end: 10 },
        "Blocked text",
        {
          model: "test-fast",
          promptTemplateVersion: "test-v1"
        }
      );
    });

    expect(error.code).toBe("AI_NOT_ALLOWED");
  });

  it("marks manual AI merges as partially applied and records a new document version", () => {
    const store = new InMemoryStore();
    const documentId = getSeedDocumentId(store);
    const originalContent = store.getDocumentForUser(documentId, "user-layla").document.content;
    const interaction = store.requestAiInteraction(
      documentId,
      "user-layla",
      "rewrite",
      { start: 0, end: 8 },
      originalContent.slice(0, 8),
      {
        model: "test-quality",
        promptTemplateVersion: "test-v1"
      }
    );

    store.completeAiInteraction(documentId, interaction.id, "Launch brief", "completed");
    const result = store.applyAiSuggestion(documentId, interaction.id, "user-layla", {
      mode: "manual_merge",
      acceptedText: "Launch brief"
    });

    expect(result.interaction.status).toBe("partially_applied");
    expect(result.interaction.requestedVersion).toBe(1);
    expect(result.document.currentVersion).toBe(2);
    expect(result.document.content.startsWith("Launch brief")).toBe(true);
    expect(result.document.versions.at(-1)?.reason).toBe("Applied AI rewrite suggestion");
  });

  it("rejects applying a suggestion after the document has changed", () => {
    const store = new InMemoryStore();
    const documentId = getSeedDocumentId(store);
    const interaction = store.requestAiInteraction(
      documentId,
      "user-layla",
      "rewrite",
      { start: 0, end: 8 },
      "Original",
      {
        model: "test-quality",
        promptTemplateVersion: "test-v1"
      }
    );

    store.completeAiInteraction(documentId, interaction.id, "Updated", "completed");
    store.updateDocumentContent(documentId, "user-layla", 1, "Another edit landed first", "Competing save");

    const error = captureAppError(() => {
      store.applyAiSuggestion(documentId, interaction.id, "user-layla", {
        mode: "replace_selection"
      });
    });

    expect(error.code).toBe("AI_CONTEXT_STALE");
  });

  it("stores the actual provider metadata on queued interactions", () => {
    const store = new InMemoryStore();
    const documentId = getSeedDocumentId(store);

    const interaction = store.requestAiInteraction(
      documentId,
      "user-layla",
      "summarize",
      { start: 0, end: 12 },
      "Original text",
      {
        model: "gpt-4.1-mini",
        promptTemplateVersion: "openai-responses-v1"
      }
    );

    expect(interaction.model).toBe("gpt-4.1-mini");
    expect(interaction.promptTemplateVersion).toBe("openai-responses-v1");
    expect(interaction.requestedVersion).toBe(1);
  });

  it("only counts actionable completed suggestions in the document summary", () => {
    const store = new InMemoryStore();
    const documentId = getSeedDocumentId(store);
    const interaction = store.requestAiInteraction(
      documentId,
      "user-layla",
      "summarize",
      { start: 0, end: 12 },
      "Original text",
      {
        model: "gpt-4.1-mini",
        promptTemplateVersion: "openai-responses-v1"
      }
    );

    store.completeAiInteraction(documentId, interaction.id, "Summary", "completed");
    expect(store.listDocumentsForUser("user-layla")[0]?.pendingAiSuggestions).toBe(1);

    store.updateDocumentContent(documentId, "user-layla", 1, "New content version", "Manual edit");
    expect(store.listDocumentsForUser("user-layla")[0]?.pendingAiSuggestions).toBe(0);
  });
});
