import type { Document, ExportDocumentRequest, ExportFormat } from "@midterm/shared";
import { AppError } from "../utils/errors.js";

export type ExportArtifact = {
  body: ArrayBuffer;
  contentType: string;
  filename: string;
};

export interface DocumentExporter {
  exportDocument(document: Document, request: ExportDocumentRequest): Promise<ExportArtifact>;
}

type FetchLike = typeof fetch;

type FastApiExportPayload = {
  format: ExportFormat;
  title: string;
  content: string;
  version: number;
  generatedAt: string;
  includeAiAppendix: boolean;
  aiInteractions: Array<{
    feature: string;
    status: string;
    initiatedBy: string;
    createdAt: string;
    requestedVersion: number;
    sourceText: string;
    suggestedText: string;
    targetLanguage?: string;
  }>;
};

const contentTypes: Record<ExportFormat, string> = {
  markdown: "text/markdown; charset=utf-8",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
};

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function fileExtension(format: ExportFormat) {
  switch (format) {
    case "markdown":
      return "md";
    case "pdf":
      return "pdf";
    case "docx":
      return "docx";
  }
}

function sanitizeFileSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "document";
}

async function readServiceErrorMessage(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = await response.json() as { detail?: string };
    return payload.detail ?? "The export service rejected the request.";
  }

  const message = await response.text();
  return message || "The export service rejected the request.";
}

export class FastApiExportService implements DocumentExporter {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options?: { baseUrl?: string; fetchImpl?: FetchLike }) {
    this.baseUrl = normalizeBaseUrl(options?.baseUrl ?? process.env.EXPORT_SERVICE_URL ?? "http://127.0.0.1:8000");
    this.fetchImpl = options?.fetchImpl ?? fetch;
  }

  async exportDocument(document: Document, request: ExportDocumentRequest): Promise<ExportArtifact> {
    const payload: FastApiExportPayload = {
      format: request.format,
      title: document.title,
      content: document.content,
      version: document.currentVersion,
      generatedAt: new Date().toISOString(),
      includeAiAppendix: request.includeAiAppendix,
      aiInteractions: document.aiInteractions.map((interaction) => ({
        feature: interaction.feature,
        status: interaction.status,
        initiatedBy: interaction.initiatedBy,
        createdAt: interaction.createdAt,
        requestedVersion: interaction.requestedVersion,
        sourceText: interaction.sourceText,
        suggestedText: interaction.suggestedText,
        targetLanguage: interaction.targetLanguage
      }))
    };

    let response: Response;

    try {
      response = await this.fetchImpl(`${this.baseUrl}/render`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    } catch {
      throw new AppError(
        503,
        "EXPORT_UNAVAILABLE",
        "The FastAPI export service is unavailable. Start the export worker and try again.",
        true
      );
    }

    if (!response.ok) {
      throw new AppError(
        response.status >= 500 ? 502 : response.status,
        "EXPORT_SERVICE_ERROR",
        await readServiceErrorMessage(response),
        true
      );
    }

    return {
      body: await response.arrayBuffer(),
      contentType: response.headers.get("content-type") ?? contentTypes[request.format],
      filename: `${sanitizeFileSegment(document.title)}-v${document.currentVersion}.${fileExtension(request.format)}`
    };
  }
}
