import { afterEach, describe, expect, it, vi } from "vitest";
import { AiService } from "./ai-service.js";
import { InMemoryStore } from "../repositories/in-memory-store.js";
import type { AiProvider } from "./ai-provider.js";
import { DocumentService } from "./document-service.js";

function createTestProvider(suggestedText = "Tighter draft") {
  return {
    getStatus() {
      return {
        mode: "mock" as const,
        live: false,
        fastModel: "test-fast",
        qualityModel: "test-quality",
        message: "Test provider"
      };
    },
    getRequestMetadata(feature) {
      return {
        model: feature === "rewrite" ? "test-quality" : "test-fast",
        promptTemplateVersion: "test-v1"
      };
    },
    generateSuggestion: vi.fn(async () => ({
      suggestedText
    }))
  } satisfies AiProvider;
}

function createAiHarness(provider = createTestProvider()) {
  const store = new InMemoryStore();
  const documents = new DocumentService(store);
  const onCompleted = vi.fn();
  const ai = new AiService(documents, provider, onCompleted);
  const documentId = documents.listDocuments("user-layla")[0]!.id;

  return {
    ai,
    documents,
    documentId,
    onCompleted,
    provider
  };
}

describe("AiService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("completes queued requests asynchronously and notifies subscribers", async () => {
    const provider = createTestProvider("Summary: key launch milestones.");
    const { ai, documents, documentId, onCompleted } = createAiHarness(provider);

    const queued = ai.request(documentId, "user-layla", "summarize", { start: 0, end: 40 });
    expect(queued.status).toBe("queued");

    await vi.waitFor(() => {
      expect(onCompleted).toHaveBeenCalledOnce();
    });

    const completed = documents.listAiInteractions(documentId, "user-layla")[0]!;
    expect(completed.id).toBe(queued.id);
    expect(completed.status).toBe("completed");
    expect(completed.model).toBe("test-fast");
    expect(completed.promptTemplateVersion).toBe("test-v1");
    expect(completed.suggestedText).toContain("Summary:");
    expect(onCompleted).toHaveBeenCalledOnce();
    expect(onCompleted.mock.calls[0]?.[0]).toBe(documentId);
    expect(onCompleted.mock.calls[0]?.[1].id).toBe(queued.id);
    expect(provider.generateSuggestion).toHaveBeenCalledOnce();
  });

  it("returns quota_exceeded once the per-user AI allowance is exhausted", async () => {
    const provider = createTestProvider();
    const { ai, documents, documentId, onCompleted } = createAiHarness(provider);

    for (let count = 0; count < 10; count += 1) {
      ai.request(documentId, "user-layla", "rewrite", { start: 0, end: 15 });
    }

    const overQuota = ai.request(documentId, "user-layla", "translate", { start: 0, end: 15 }, "Arabic");
    expect(overQuota.status).toBe("quota_exceeded");

    await vi.waitFor(() => {
      expect(onCompleted).toHaveBeenCalledTimes(10);
    });

    expect(onCompleted).toHaveBeenCalledTimes(10);
    expect(documents.listAiInteractions(documentId, "user-layla")[0]?.status).toBe("quota_exceeded");
    expect(provider.generateSuggestion).toHaveBeenCalledTimes(10);
  });

  it("marks interactions as failed when the provider throws", async () => {
    const provider = {
      getStatus() {
        return {
          mode: "mock" as const,
          live: false,
          fastModel: "test-fast",
          qualityModel: "test-quality",
          message: "Test provider"
        };
      },
      getRequestMetadata() {
        return {
          model: "test-quality",
          promptTemplateVersion: "test-v1"
        };
      },
      generateSuggestion: vi.fn(async () => {
        throw new Error("upstream timeout");
      })
    } satisfies AiProvider;
    const { ai, documents, documentId, onCompleted } = createAiHarness(provider);

    ai.request(documentId, "user-layla", "rewrite", { start: 0, end: 15 });

    await vi.waitFor(() => {
      expect(onCompleted).toHaveBeenCalledOnce();
    });

    expect(documents.listAiInteractions(documentId, "user-layla")[0]?.status).toBe("failed");
    expect(documents.listAiInteractions(documentId, "user-layla")[0]?.suggestedText).toContain("upstream timeout");
  });
});
