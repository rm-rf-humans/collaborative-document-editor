import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  aiOperationResponseSchema,
  authLoginResponseSchema,
  documentResponseSchema,
  listDocumentsResponseSchema,
  listPermissionsResponseSchema
} from "@midterm/shared";
import { createApp } from "./app.js";

async function loginAs(userId: string) {
  const { app } = createApp();
  const response = await request(app)
    .post("/v1/auth/login")
    .send({ userId })
    .expect(201);

  const parsed = authLoginResponseSchema.parse(response.body);
  return {
    app,
    token: parsed.session.token
  };
}

describe("@midterm/api", () => {
  it("logs in and lists the caller's accessible documents", async () => {
    const { app, token } = await loginAs("user-layla");
    const response = await request(app)
      .get("/v1/documents")
      .set("authorization", `Bearer ${token}`)
      .expect(200);

    const parsed = listDocumentsResponseSchema.parse(response.body);
    expect(parsed.documents[0]?.title).toBe("Launch Plan Draft");
  });

  it("creates a document and returns the documented contract", async () => {
    const { app, token } = await loginAs("user-layla");
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

  it("updates document sharing and queues an AI request", async () => {
    const { app, token } = await loginAs("user-layla");
    const documentsResponse = await request(app)
      .get("/v1/documents")
      .set("authorization", `Bearer ${token}`)
      .expect(200);
    const documents = listDocumentsResponseSchema.parse(documentsResponse.body);
    const documentId = documents.documents[0]!.id;

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
});
