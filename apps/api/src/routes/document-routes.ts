import { Router } from "express";
import {
  aiProviderResponseSchema,
  aiOperationRequestSchema,
  aiOperationResponseSchema,
  applyAiSuggestionRequestSchema,
  createDocumentRequestSchema,
  documentResponseSchema,
  exportDocumentRequestSchema,
  listAiInteractionsResponseSchema,
  listDocumentsResponseSchema,
  listPermissionsResponseSchema,
  listVersionsResponseSchema,
  revertDocumentRequestSchema,
  shareDocumentRequestSchema,
  updateDocumentContentRequestSchema,
  updateDocumentContentResponseSchema
} from "@midterm/shared";
import { requireAuth } from "../middleware/require-auth.js";
import { CollaborationHub } from "../realtime/collaboration-hub.js";
import { AiService } from "../services/ai-service.js";
import { AuthService } from "../services/auth-service.js";
import { DocumentService } from "../services/document-service.js";
import type { DocumentExporter } from "../services/export-service.js";

export function createDocumentRouter(
  auth: AuthService,
  documents: DocumentService,
  ai: AiService,
  hub: CollaborationHub,
  exporter: DocumentExporter
) {
  const router = Router();

  router.use(requireAuth(auth));

  router.get("/ai/provider", (_request, response) => {
    response.json(aiProviderResponseSchema.parse({
      provider: ai.getProviderStatus()
    }));
  });

  router.get("/documents", (request, response) => {
    response.json(listDocumentsResponseSchema.parse({
      documents: documents.listDocuments(request.auth!.user.id)
    }));
  });

  router.post("/documents", (request, response) => {
    const body = createDocumentRequestSchema.parse(request.body);
    const document = documents.createDocument(request.auth!.user.id, body.title, body.content);
    response.status(201).json(documentResponseSchema.parse({ document }));
  });

  router.get("/documents/:documentId", (request, response) => {
    response.json(documentResponseSchema.parse({
      document: documents.getDocument(request.params.documentId, request.auth!.user.id)
    }));
  });

  router.post("/documents/:documentId/export", async (request, response) => {
    const body = exportDocumentRequestSchema.parse(request.body);
    const document = documents.getDocument(request.params.documentId, request.auth!.user.id);
    const artifact = await exporter.exportDocument(document, body);

    response
      .setHeader("content-type", artifact.contentType)
      .setHeader("content-disposition", `attachment; filename="${artifact.filename}"`)
      .status(200)
      .send(Buffer.from(artifact.body));
  });

  router.put("/documents/:documentId/content", (request, response) => {
    const body = updateDocumentContentRequestSchema.parse(request.body);
    const result = documents.updateContent(
      request.params.documentId,
      request.auth!.user.id,
      body.baseVersion,
      body.content,
      body.reason
    );
    hub.broadcastDocumentUpdate(request.params.documentId, result.document.content, result.document.currentVersion, request.auth!.user.id);
    response.json(updateDocumentContentResponseSchema.parse(result));
  });

  router.get("/documents/:documentId/versions", (request, response) => {
    response.json(listVersionsResponseSchema.parse({
      versions: documents.listVersions(request.params.documentId, request.auth!.user.id)
    }));
  });

  router.post("/documents/:documentId/revert", (request, response) => {
    const body = revertDocumentRequestSchema.parse(request.body);
    const result = documents.revert(request.params.documentId, request.auth!.user.id, body.versionNumber);
    hub.broadcastDocumentUpdate(request.params.documentId, result.document.content, result.document.currentVersion, request.auth!.user.id);
    response.json(updateDocumentContentResponseSchema.parse(result));
  });

  router.get("/documents/:documentId/permissions", (request, response) => {
    response.json(listPermissionsResponseSchema.parse({
      permissions: documents.listPermissions(request.params.documentId, request.auth!.user.id)
    }));
  });

  router.post("/documents/:documentId/share", (request, response) => {
    const body = shareDocumentRequestSchema.parse(request.body);
    documents.share(request.params.documentId, request.auth!.user.id, body);
    response.json(listPermissionsResponseSchema.parse({
      permissions: documents.listPermissions(request.params.documentId, request.auth!.user.id)
    }));
  });

  router.get("/documents/:documentId/ai-interactions", (request, response) => {
    response.json(listAiInteractionsResponseSchema.parse({
      interactions: documents.listAiInteractions(request.params.documentId, request.auth!.user.id)
    }));
  });

  router.post("/documents/:documentId/ai-operations", (request, response) => {
    const body = aiOperationRequestSchema.parse(request.body);
    const interaction = ai.request(
      request.params.documentId,
      request.auth!.user.id,
      body.feature,
      body.selection,
      body.targetLanguage
    );
    response.status(interaction.status === "quota_exceeded" ? 429 : 202).json(aiOperationResponseSchema.parse({
      interaction
    }));
  });

  router.post("/documents/:documentId/ai-interactions/:interactionId/apply", (request, response) => {
    const body = applyAiSuggestionRequestSchema.parse(request.body);
    const result = documents.applyAiSuggestion(
      request.params.documentId,
      request.params.interactionId,
      request.auth!.user.id,
      body
    );
    hub.broadcastDocumentUpdate(request.params.documentId, result.document.content, result.document.currentVersion, request.auth!.user.id);
    response.json(documentResponseSchema.parse({
      document: result.document
    }));
  });

  router.post("/documents/:documentId/ai-interactions/:interactionId/reject", (request, response) => {
    documents.rejectAiSuggestion(request.params.documentId, request.params.interactionId, request.auth!.user.id);
    response.json(listAiInteractionsResponseSchema.parse({
      interactions: documents.listAiInteractions(request.params.documentId, request.auth!.user.id)
    }));
  });

  return router;
}
