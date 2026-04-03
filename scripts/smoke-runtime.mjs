import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { WebSocket } from "ws";

const apiBaseUrl = (process.env.SMOKE_API_URL ?? "http://127.0.0.1:4000").replace(/\/+$/, "");
const smokeTimeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 8000);

function step(message) {
  console.log(`- ${message}`);
}

function describePayload(payload) {
  if (typeof payload === "string") {
    return payload;
  }

  if (payload && typeof payload === "object") {
    return JSON.stringify(payload);
  }

  return String(payload);
}

async function requestJson(path, { method = "GET", token, body, expectedStatus } = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (expectedStatus && response.status !== expectedStatus) {
    throw new Error(`${method} ${path} returned ${response.status}; expected ${expectedStatus}. Payload: ${describePayload(payload)}`);
  }

  if (!response.ok) {
    const message = typeof payload === "object" && payload?.error
      ? `${payload.error.code}: ${payload.error.message}`
      : describePayload(payload);
    throw new Error(`${method} ${path} failed with ${response.status}. ${message}`);
  }

  return payload;
}

async function requestBinary(path, { method = "GET", token, body, expectedStatus } = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (expectedStatus && response.status !== expectedStatus) {
    const payload = await response.text();
    throw new Error(`${method} ${path} returned ${response.status}; expected ${expectedStatus}. Payload: ${payload}`);
  }

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    throw new Error(`${method} ${path} failed with ${response.status}. ${describePayload(payload)}`);
  }

  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    filename: response.headers.get("content-disposition") ?? ""
  };
}

async function login(userId) {
  const payload = await requestJson("/v1/auth/login", {
    method: "POST",
    body: { userId },
    expectedStatus: 201
  });
  return payload.session.token;
}

async function poll(check, description, { timeoutMs = smokeTimeoutMs, intervalMs = 100 } = {}) {
  const start = Date.now();
  let lastError = null;

  while (Date.now() - start < timeoutMs) {
    try {
      return await check();
    } catch (error) {
      lastError = error;
      await delay(intervalMs);
    }
  }

  throw new Error(`Timed out while waiting for ${description}.${lastError instanceof Error ? ` Last error: ${lastError.message}` : ""}`);
}

function createSocketClient(token, documentId, label) {
  const url = new URL(apiBaseUrl.replace(/^http/, "ws"));
  url.pathname = "/ws";
  url.searchParams.set("token", token);
  url.searchParams.set("documentId", documentId);

  const socket = new WebSocket(url);
  const queue = [];
  const waiters = [];
  let closePromiseResolve = null;
  let closePromiseReject = null;
  const closePromise = new Promise((resolve, reject) => {
    closePromiseResolve = resolve;
    closePromiseReject = reject;
  });

  function satisfyWaiters() {
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      const messageIndex = queue.findIndex(waiter.predicate);
      if (messageIndex === -1) {
        continue;
      }

      const [message] = queue.splice(messageIndex, 1);
      waiters.splice(index, 1);
      clearTimeout(waiter.timeoutId);
      waiter.resolve(message);
    }
  }

  socket.on("message", (rawMessage) => {
    const message = JSON.parse(String(rawMessage));
    queue.push(message);
    satisfyWaiters();
  });

  socket.on("error", (error) => {
    closePromiseReject?.(error);
  });

  socket.on("close", () => {
    closePromiseResolve?.();
  });

  return {
    async opened() {
      if (socket.readyState === WebSocket.OPEN) {
        return;
      }

      await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error(`Timed out while opening ${label} WebSocket.`)), smokeTimeoutMs);
        socket.once("open", () => {
          clearTimeout(timeoutId);
          resolve();
        });
        socket.once("error", (error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
      });
    },
    send(message) {
      socket.send(JSON.stringify(message));
    },
    waitFor(predicate, description, timeoutMs = smokeTimeoutMs) {
      const existingIndex = queue.findIndex(predicate);
      if (existingIndex !== -1) {
        const [message] = queue.splice(existingIndex, 1);
        return Promise.resolve(message);
      }

      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          const waiterIndex = waiters.findIndex((waiter) => waiter.timeoutId === timeoutId);
          if (waiterIndex !== -1) {
            waiters.splice(waiterIndex, 1);
          }
          reject(new Error(`Timed out while waiting for ${description} on ${label} WebSocket.`));
        }, timeoutMs);

        waiters.push({
          predicate,
          resolve,
          reject,
          timeoutId
        });
      });
    },
    async close() {
      if (socket.readyState === WebSocket.CLOSED) {
        return;
      }

      socket.close();
      await closePromise;
    }
  };
}

function findDocumentSummary(documents, documentId) {
  return documents.find((document) => document.id === documentId);
}

async function main() {
  step(`Running runtime smoke test against ${apiBaseUrl}`);

  const usersPayload = await requestJson("/v1/users");
  assert(usersPayload.users.some((user) => user.id === "user-layla"));
  assert(usersPayload.users.some((user) => user.id === "user-omar"));
  assert(usersPayload.users.some((user) => user.id === "user-mona"));

  const ownerToken = await login("user-layla");
  const editorToken = await login("user-omar");
  const commenterToken = await login("user-mona");

  const providerPayload = await requestJson("/v1/ai/provider", { token: ownerToken });
  assert(providerPayload.provider.mode === "mock" || providerPayload.provider.mode === "openai");
  step(`AI provider reported ${providerPayload.provider.mode} mode`);

  const title = `Smoke Test ${new Date().toISOString()}`;
  const initialContent = "i need this paragraph cleaned up. it has bad spacing !";

  const createdPayload = await requestJson("/v1/documents", {
    method: "POST",
    token: ownerToken,
    body: {
      title,
      content: initialContent
    },
    expectedStatus: 201
  });

  const documentId = createdPayload.document.id;
  assert.equal(createdPayload.document.currentVersion, 1);
  step(`Created document ${documentId}`);

  const ownerDocuments = await requestJson("/v1/documents", { token: ownerToken });
  assert(findDocumentSummary(ownerDocuments.documents, documentId));

  await requestJson(`/v1/documents/${documentId}/share`, {
    method: "POST",
    token: ownerToken,
    body: {
      principalType: "user",
      principalId: "user-omar",
      role: "editor",
      allowAi: true
    },
    expectedStatus: 200
  });

  const permissionsPayload = await requestJson(`/v1/documents/${documentId}/share`, {
    method: "POST",
    token: ownerToken,
    body: {
      principalType: "user",
      principalId: "user-mona",
      role: "commenter",
      allowAi: true
    },
    expectedStatus: 200
  });

  assert(permissionsPayload.permissions.some((permission) => permission.principalId === "user-omar" && permission.role === "editor"));
  assert(permissionsPayload.permissions.some((permission) => permission.principalId === "user-mona" && permission.role === "commenter"));
  step("Verified sharing for editor and commenter roles");

  const editorDocumentPayload = await requestJson(`/v1/documents/${documentId}`, { token: editorToken });
  assert.equal(editorDocumentPayload.document.id, documentId);

  const commenterDocumentPayload = await requestJson(`/v1/documents/${documentId}`, { token: commenterToken });
  assert.equal(commenterDocumentPayload.document.id, documentId);

  let commenterEditRejected = false;
  try {
    await requestJson(`/v1/documents/${documentId}/content`, {
      method: "PUT",
      token: commenterToken,
      body: {
        baseVersion: 1,
        content: "Should not save",
        reason: "Commenter edit attempt"
      },
      expectedStatus: 403
    });
  } catch (error) {
    commenterEditRejected = String(error).includes("403");
    if (!commenterEditRejected) {
      throw error;
    }
  }
  assert(commenterEditRejected);
  step("Verified commenter cannot edit");

  const ownerSocket = createSocketClient(ownerToken, documentId, "owner");
  const editorSocket = createSocketClient(editorToken, documentId, "editor");
  await ownerSocket.opened();
  await ownerSocket.waitFor(
    (message) => message.type === "presence.snapshot" && message.documentId === documentId,
    "initial presence snapshot"
  );
  await editorSocket.opened();
  await editorSocket.waitFor(
    (message) => typeof message.type === "string" && message.documentId === documentId && message.type.startsWith("presence."),
    "editor presence message"
  );
  await ownerSocket.waitFor(
    (message) => message.type === "presence.updated" && message.documentId === documentId && message.participants.length === 2,
    "two active collaborators"
  );

  await poll(async () => {
    const listPayload = await requestJson("/v1/documents", { token: ownerToken });
    const summary = findDocumentSummary(listPayload.documents, documentId);
    assert(summary);
    assert.equal(summary.activeCollaboratorCount, 2);
    return true;
  }, "active collaborator count to reach 2");
  step("Verified realtime presence count");

  const realtimeContent = `${initialContent}\nThis sentence came from the realtime channel.`;
  editorSocket.send({
    type: "document.change",
    documentId,
    content: realtimeContent,
    baseVersion: 1,
    cursor: realtimeContent.length
  });

  await ownerSocket.waitFor(
    (message) => message.type === "document.updated" && message.documentId === documentId && message.version === 2,
    "realtime document update"
  );
  step("Verified realtime document update");

  const documentAfterRealtime = await requestJson(`/v1/documents/${documentId}`, { token: ownerToken });
  assert.equal(documentAfterRealtime.document.currentVersion, 2);
  assert.equal(documentAfterRealtime.document.content, realtimeContent);

  const apiEditContent = `${realtimeContent}\nthis line is for proofread and export coverage .`;
  await requestJson(`/v1/documents/${documentId}/content`, {
    method: "PUT",
    token: ownerToken,
    body: {
      baseVersion: 2,
      content: apiEditContent,
      reason: "Smoke API edit"
    },
    expectedStatus: 200
  });
  await ownerSocket.waitFor(
    (message) => message.type === "document.updated" && message.documentId === documentId && message.version === 3,
    "REST document update broadcast"
  );
  step("Verified REST edit and broadcast");

  const versionsAfterEdit = await requestJson(`/v1/documents/${documentId}/versions`, { token: ownerToken });
  assert(versionsAfterEdit.versions.some((version) => version.versionNumber === 1));
  assert(versionsAfterEdit.versions.some((version) => version.versionNumber === 2));
  assert(versionsAfterEdit.versions.some((version) => version.versionNumber === 3));

  const proofreadPayload = await requestJson(`/v1/documents/${documentId}/ai-operations`, {
    method: "POST",
    token: ownerToken,
    body: {
      feature: "proofread",
      selection: {
        start: 0,
        end: apiEditContent.length
      }
    },
    expectedStatus: 202
  });

  const proofreadInteraction = await poll(async () => {
    const aiPayload = await requestJson(`/v1/documents/${documentId}/ai-interactions`, { token: ownerToken });
    const match = aiPayload.interactions.find((interaction) => interaction.id === proofreadPayload.interaction.id);
    assert(match);
    assert.notEqual(match.status, "queued");
    assert.equal(match.status, "completed");
    assert(match.suggestedText.length > 0);
    return match;
  }, "proofread AI completion");
  step("Verified proofread AI completion");

  await requestJson(`/v1/documents/${documentId}/ai-interactions/${proofreadInteraction.id}/apply`, {
    method: "POST",
    token: ownerToken,
    body: {
      mode: "replace_selection"
    },
    expectedStatus: 200
  });
  await ownerSocket.waitFor(
    (message) => message.type === "document.updated" && message.documentId === documentId && message.version === 4,
    "AI apply document update"
  );

  const afterAiApply = await requestJson(`/v1/documents/${documentId}`, { token: ownerToken });
  assert.equal(afterAiApply.document.currentVersion, 4);
  assert.notEqual(afterAiApply.document.content, apiEditContent);
  step("Verified AI apply flow");

  const completionPayload = await requestJson(`/v1/documents/${documentId}/ai-operations`, {
    method: "POST",
    token: ownerToken,
    body: {
      feature: "complete",
      selection: {
        start: afterAiApply.document.content.length,
        end: afterAiApply.document.content.length
      }
    },
    expectedStatus: 202
  });

  const completionInteraction = await poll(async () => {
    const aiPayload = await requestJson(`/v1/documents/${documentId}/ai-interactions`, { token: ownerToken });
    const match = aiPayload.interactions.find((interaction) => interaction.id === completionPayload.interaction.id);
    assert(match);
    assert.notEqual(match.status, "queued");
    assert.equal(match.status, "completed");
    return match;
  }, "completion AI response");

  const rejectPayload = await requestJson(`/v1/documents/${documentId}/ai-interactions/${completionInteraction.id}/reject`, {
    method: "POST",
    token: ownerToken,
    body: {},
    expectedStatus: 200
  });
  assert(rejectPayload.interactions.some((interaction) => interaction.id === completionInteraction.id && interaction.status === "rejected"));
  step("Verified AI reject flow");

  const revertPayload = await requestJson(`/v1/documents/${documentId}/revert`, {
    method: "POST",
    token: ownerToken,
    body: {
      versionNumber: 3
    },
    expectedStatus: 200
  });
  assert.equal(revertPayload.document.currentVersion, 5);
  assert.equal(revertPayload.document.content, apiEditContent);
  await ownerSocket.waitFor(
    (message) => message.type === "document.updated" && message.documentId === documentId && message.version === 5,
    "revert document update"
  );
  step("Verified version revert");

  const markdownExport = await requestBinary(`/v1/documents/${documentId}/export`, {
    method: "POST",
    token: ownerToken,
    body: {
      format: "markdown",
      includeAiAppendix: true
    },
    expectedStatus: 200
  });
  const markdownText = markdownExport.body.toString("utf8");
  assert(markdownExport.contentType.startsWith("text/markdown"));
  assert(markdownText.includes("## AI Suggestion History"));
  assert(markdownText.includes(title));

  const pdfExport = await requestBinary(`/v1/documents/${documentId}/export`, {
    method: "POST",
    token: ownerToken,
    body: {
      format: "pdf",
      includeAiAppendix: true
    },
    expectedStatus: 200
  });
  assert(pdfExport.contentType.includes("application/pdf"));
  assert(pdfExport.body.length > 1000);

  const docxExport = await requestBinary(`/v1/documents/${documentId}/export`, {
    method: "POST",
    token: ownerToken,
    body: {
      format: "docx",
      includeAiAppendix: true
    },
    expectedStatus: 200
  });
  assert(docxExport.contentType.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
  assert(docxExport.body.length > 1000);
  step("Verified markdown, PDF, and DOCX export");

  await ownerSocket.close();
  await editorSocket.close();
  await poll(async () => {
    const listPayload = await requestJson("/v1/documents", { token: ownerToken });
    const summary = findDocumentSummary(listPayload.documents, documentId);
    assert(summary);
    assert.equal(summary.activeCollaboratorCount, 0);
    return true;
  }, "active collaborator count to return to 0");
  step("Verified collaborator cleanup after socket close");

  console.log("Runtime smoke test passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
