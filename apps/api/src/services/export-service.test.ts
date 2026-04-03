import { describe, expect, it, vi } from "vitest";
import type { Document } from "@midterm/shared";
import { FastApiExportService } from "./export-service.js";

const documentFixture: Document = {
  id: "doc-1",
  title: "Launch Plan Draft",
  content: "# Launch\n\nExport this draft.",
  createdAt: "2026-04-03T10:00:00.000Z",
  updatedAt: "2026-04-03T10:05:00.000Z",
  ownerId: "user-layla",
  currentVersion: 3,
  activeCollaboratorCount: 2,
  permissions: [],
  versions: [],
  aiInteractions: [
    {
      id: "ai-1",
      documentId: "doc-1",
      feature: "rewrite",
      status: "applied",
      initiatedBy: "user-layla",
      selection: { start: 0, end: 7 },
      sourceText: "Launch",
      suggestedText: "Sharper launch summary",
      createdAt: "2026-04-03T10:04:00.000Z",
      requestedVersion: 2,
      promptTemplateVersion: "v1.2",
      model: "gpt-4.1",
      quotaConsumed: 1
    }
  ]
};

describe("FastApiExportService", () => {
  it("posts the document snapshot to the FastAPI worker and returns a typed artifact", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("pdf-binary", {
      status: 200,
      headers: {
        "content-type": "application/pdf"
      }
    }));
    const service = new FastApiExportService({
      baseUrl: "http://127.0.0.1:8010",
      fetchImpl
    });

    const artifact = await service.exportDocument(documentFixture, {
      format: "pdf",
      includeAiAppendix: true
    });

    expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:8010/render", expect.objectContaining({
      method: "POST"
    }));
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toMatchObject({
      format: "pdf",
      title: "Launch Plan Draft",
      includeAiAppendix: true,
      aiInteractions: [
        expect.objectContaining({
          feature: "rewrite",
          status: "applied"
        })
      ]
    });
    expect(artifact.contentType).toBe("application/pdf");
    expect(artifact.filename).toBe("launch-plan-draft-v3.pdf");
    expect(Buffer.from(artifact.body).toString()).toBe("pdf-binary");
  });

  it("converts connectivity failures into a retryable export error", async () => {
    const service = new FastApiExportService({
      fetchImpl: vi.fn().mockRejectedValue(new Error("connection refused"))
    });

    await expect(service.exportDocument(documentFixture, {
      format: "markdown",
      includeAiAppendix: false
    })).rejects.toMatchObject({
      code: "EXPORT_UNAVAILABLE",
      statusCode: 503,
      retryable: true
    });
  });
});
