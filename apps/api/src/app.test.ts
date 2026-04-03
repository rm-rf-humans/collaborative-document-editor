import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  aiProviderResponseSchema,
  aiOperationResponseSchema,
  authLoginResponseSchema,
  documentResponseSchema,
  errorResponseSchema,
  listDocumentsResponseSchema,
  listPermissionsResponseSchema,
  updateDocumentContentResponseSchema
} from "@midterm/shared";
import { createApp, createApplicationContext } from "./app.js";

async function loginAs(app: ReturnType<typeof createApp>["app"], userId: string) {
  const response = await request(app)
    .post("/v1/auth/login")
    .send({ userId })
    .expect(201);

  return authLoginResponseSchema.parse(response.body).session.token;
}

async function getFirstDocumentId(app: ReturnType<typeof createApp>["app"], token: string) {
  const response = await request(app)
    .get("/v1/documents")
    .set("authorization", `Bearer ${token}`)
    .expect(200);

  return listDocumentsResponseSchema.parse(response.body).documents[0]!.id;
}

describe("@midterm/api", () => {
  it("rejects unauthenticated access to protected document routes", async () => {
    const { app } = createApp();
    const response = await request(app)
      .get("/v1/documents")
      .expect(401);

    const parsed = errorResponseSchema.parse(response.body);
    expect(parsed.error.code).toBe("UNAUTHORIZED");
  });

  it("reports the configured AI provider status for authenticated clients", async () => {
    const { app } = createApp();
    const token = await loginAs(app, "user-layla");
    const response = await request(app)
      .get("/v1/ai/provider")
      .set("authorization", `Bearer ${token}`)
      .expect(200);

    const parsed = aiProviderResponseSchema.parse(response.body);
    expect(parsed.provider.mode).toBe("mock");
    expect(parsed.provider.live).toBe(false);
  });

  it("logs in and lists the caller's accessible documents", async () => {
    const { app } = createApp();
    const token = await loginAs(app, "user-layla");
    const response = await request(app)
      .get("/v1/documents")
      .set("authorization", `Bearer ${token}`)
      .expect(200);

    const parsed = listDocumentsResponseSchema.parse(response.body);
    expect(parsed.documents[0]?.title).toBe("Launch Plan Draft");
  });

  it("creates a document and returns the documented contract", async () => {
    const { app } = createApp();
    const token = await loginAs(app, "user-layla");
    const response = await request(app)
      .post("/v1/documents")
      .set("authorization", `Bearer ${token}`)
      .send({
        title: "Architecture Notes",
        content: "Section 1"
      })
      .expect(201);

    const parsed = documentResponseSchema.parse(response.body);
    expect(parsed.document.currentVersion).toBe(1);
    expect(parsed.document.permissions[0]?.role).toBe("owner");
  });

  it("proxies document export through the FastAPI export worker contract", async () => {
    const context = createApplicationContext();
    context.exporter = {
      async exportDocument(document) {
        return {
          body: new TextEncoder().encode(`PDF:${document.title}`).buffer,
          contentType: "application/pdf",
          filename: "launch-plan-draft-v1.pdf"
        };
      }
    };

    const { app } = createApp(context);
    const token = await loginAs(app, "user-layla");
    const documentId = await getFirstDocumentId(app, token);

    const response = await request(app)
      .post(`/v1/documents/${documentId}/export`)
      .set("authorization", `Bearer ${token}`)
      .send({
        format: "pdf",
        includeAiAppendix: true
      })
      .expect(200);

    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain("launch-plan-draft-v1.pdf");
    expect(Buffer.from(response.body).toString()).toBe("PDF:Launch Plan Draft");
  });

  it("updates document sharing and queues an AI request", async () => {
    const { app } = createApp();
    const token = await loginAs(app, "user-layla");
    const documentId = await getFirstDocumentId(app, token);

    const sharingResponse = await request(app)
      .post(`/v1/documents/${documentId}/share`)
      .set("authorization", `Bearer ${token}`)
      .send({
        principalType: "user",
        principalId: "user-mona",
        role: "commenter",
        allowAi: true
      })
      .expect(200);

    const permissions = listPermissionsResponseSchema.parse(sharingResponse.body);
    expect(permissions.permissions.some((permission) => permission.principalId === "user-mona" && permission.allowAi)).toBe(true);

    const aiResponse = await request(app)
      .post(`/v1/documents/${documentId}/ai-operations`)
      .set("authorization", `Bearer ${token}`)
      .send({
        feature: "summarize",
        selection: { start: 0, end: 25 }
      })
      .expect(202);

    const parsedAiResponse = aiOperationResponseSchema.parse(aiResponse.body);
    expect(parsedAiResponse.interaction.status).toBe("queued");
  });

  it("accepts zero-length selections for inline completion requests", async () => {
    const { app } = createApp();
    const token = await loginAs(app, "user-layla");
    const documentId = await getFirstDocumentId(app, token);

    const response = await request(app)
      .post(`/v1/documents/${documentId}/ai-operations`)
      .set("authorization", `Bearer ${token}`)
      .send({
        feature: "complete",
        selection: { start: 24, end: 24 }
      })
      .expect(202);

    const parsed = aiOperationResponseSchema.parse(response.body);
    expect(parsed.interaction.feature).toBe("complete");
    expect(parsed.interaction.sourceText).toContain("Cursor at character 24");
    expect(parsed.interaction.requestedVersion).toBe(1);
  });

  it("blocks commenters from editing shared content", async () => {
    const { app } = createApp();
    const token = await loginAs(app, "user-sara");
    const documentId = await getFirstDocumentId(app, token);

    const response = await request(app)
      .put(`/v1/documents/${documentId}/content`)
      .set("authorization", `Bearer ${token}`)
      .send({
        baseVersion: 1,
        content: "Attempted edit",
        reason: "Should fail"
      })
      .expect(403);

    const parsed = errorResponseSchema.parse(response.body);
    expect(parsed.error.code).toBe("EDIT_NOT_ALLOWED");
  });

  it("returns a conflict when a save is based on a stale version", async () => {
    const { app } = createApp();
    const ownerToken = await loginAs(app, "user-layla");
    const editorToken = await loginAs(app, "user-omar");
    const documentId = await getFirstDocumentId(app, ownerToken);

    const ownerResponse = await request(app)
      .put(`/v1/documents/${documentId}/content`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({
        baseVersion: 1,
        content: "Fresh owner update",
        reason: "Owner save"
      })
      .expect(200);

    const ownerParsed = updateDocumentContentResponseSchema.parse(ownerResponse.body);
    expect(ownerParsed.document.currentVersion).toBe(2);

    const conflictResponse = await request(app)
      .put(`/v1/documents/${documentId}/content`)
      .set("authorization", `Bearer ${editorToken}`)
      .send({
        baseVersion: 1,
        content: "Stale editor update",
        reason: "Editor save"
      })
      .expect(409);

    const parsedConflict = errorResponseSchema.parse(conflictResponse.body);
    expect(parsedConflict.error.code).toBe("VERSION_CONFLICT");
  });

  it("rejects applying an AI suggestion if the document changed after the request was created", async () => {
    const { app } = createApp();
    const token = await loginAs(app, "user-layla");
    const documentId = await getFirstDocumentId(app, token);

    const aiResponse = await request(app)
      .post(`/v1/documents/${documentId}/ai-operations`)
      .set("authorization", `Bearer ${token}`)
      .send({
        feature: "rewrite",
        selection: { start: 0, end: 20 }
      })
      .expect(202);
    const interaction = aiOperationResponseSchema.parse(aiResponse.body).interaction;

    await request(app)
      .put(`/v1/documents/${documentId}/content`)
      .set("authorization", `Bearer ${token}`)
      .send({
        baseVersion: 1,
        content: "A later edit invalidated the queued suggestion.",
        reason: "Fresh save"
      })
      .expect(200);

    const applyResponse = await request(app)
      .post(`/v1/documents/${documentId}/ai-interactions/${interaction.id}/apply`)
      .set("authorization", `Bearer ${token}`)
      .send({
        mode: "replace_selection"
      })
      .expect(409);

    const parsed = errorResponseSchema.parse(applyResponse.body);
    expect(parsed.error.code).toBe("AI_CONTEXT_STALE");
  });
});
