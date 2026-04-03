import {
  aiProviderResponseSchema,
  authLoginResponseSchema,
  authMeResponseSchema,
  aiOperationResponseSchema,
  documentResponseSchema,
  exportDocumentRequestSchema,
  listAiInteractionsResponseSchema,
  listDocumentsResponseSchema,
  listPermissionsResponseSchema,
  listUsersResponseSchema,
  listVersionsResponseSchema,
  type AiOperationRequest,
  type ApplyAiSuggestionRequest,
  type CreateDocumentRequest,
  type ExportDocumentRequest,
  type RevertDocumentRequest,
  type ShareDocumentRequest,
  type UpdateDocumentContentRequest,
  updateDocumentContentResponseSchema
} from "@midterm/shared";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = {
  method?: string;
  token?: string | null;
  body?: unknown;
};

type BinaryResponse = {
  blob: Blob;
  filename: string;
  contentType: string;
};

function buildHeaders(options: Pick<RequestOptions, "token">) {
  return {
    "content-type": "application/json",
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
  };
}

function parseFilename(contentDisposition: string | null) {
  if (!contentDisposition) {
    return "export.bin";
  }

  const match = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
  return match?.[1] ?? "export.bin";
}

async function request<T>(path: string, options: RequestOptions = {}, parser: { parse(input: unknown): T }) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: buildHeaders(options),
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new ApiError(
      payload.error?.message ?? "Request failed",
      response.status,
      payload.error?.code
    );
  }

  return parser.parse(payload);
}

async function requestBinary(path: string, options: RequestOptions = {}): Promise<BinaryResponse> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: buildHeaders(options),
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : { error: { message: await response.text() } };

    throw new ApiError(
      payload.error?.message ?? "Request failed",
      response.status,
      payload.error?.code
    );
  }

  return {
    blob: await response.blob(),
    filename: parseFilename(response.headers.get("content-disposition")),
    contentType: response.headers.get("content-type") ?? "application/octet-stream"
  };
}

export const api = {
  getAiProvider(token: string) {
    return request("/v1/ai/provider", { token }, aiProviderResponseSchema);
  },
  listUsers() {
    return request("/v1/users", {}, listUsersResponseSchema);
  },
  login(userId: string) {
    return request("/v1/auth/login", { method: "POST", body: { userId } }, authLoginResponseSchema);
  },
  me(token: string) {
    return request("/v1/auth/me", { token }, authMeResponseSchema);
  },
  listDocuments(token: string) {
    return request("/v1/documents", { token }, listDocumentsResponseSchema);
  },
  createDocument(token: string, body: CreateDocumentRequest) {
    return request("/v1/documents", { method: "POST", token, body }, documentResponseSchema);
  },
  getDocument(token: string, documentId: string) {
    return request(`/v1/documents/${documentId}`, { token }, documentResponseSchema);
  },
  exportDocument(token: string, documentId: string, body: ExportDocumentRequest) {
    return requestBinary(
      `/v1/documents/${documentId}/export`,
      {
        method: "POST",
        token,
        body: exportDocumentRequestSchema.parse(body)
      }
    );
  },
  updateDocument(token: string, documentId: string, body: UpdateDocumentContentRequest) {
    return request(
      `/v1/documents/${documentId}/content`,
      { method: "PUT", token, body },
      updateDocumentContentResponseSchema
    );
  },
  listVersions(token: string, documentId: string) {
    return request(`/v1/documents/${documentId}/versions`, { token }, listVersionsResponseSchema);
  },
  revertDocument(token: string, documentId: string, body: RevertDocumentRequest) {
    return request(
      `/v1/documents/${documentId}/revert`,
      { method: "POST", token, body },
      updateDocumentContentResponseSchema
    );
  },
  listPermissions(token: string, documentId: string) {
    return request(`/v1/documents/${documentId}/permissions`, { token }, listPermissionsResponseSchema);
  },
  shareDocument(token: string, documentId: string, body: ShareDocumentRequest) {
    return request(`/v1/documents/${documentId}/share`, { method: "POST", token, body }, listPermissionsResponseSchema);
  },
  listAiInteractions(token: string, documentId: string) {
    return request(`/v1/documents/${documentId}/ai-interactions`, { token }, listAiInteractionsResponseSchema);
  },
  requestAi(token: string, documentId: string, body: AiOperationRequest) {
    return request(`/v1/documents/${documentId}/ai-operations`, { method: "POST", token, body }, aiOperationResponseSchema);
  },
  applyAi(token: string, documentId: string, interactionId: string, body: ApplyAiSuggestionRequest) {
    return request(
      `/v1/documents/${documentId}/ai-interactions/${interactionId}/apply`,
      { method: "POST", token, body },
      documentResponseSchema
    );
  },
  rejectAi(token: string, documentId: string, interactionId: string) {
    return request(
      `/v1/documents/${documentId}/ai-interactions/${interactionId}/reject`,
      { method: "POST", token, body: {} },
      listAiInteractionsResponseSchema
    );
  },
  createRealtimeSocket(token: string, documentId: string) {
    const socketUrl = new URL(apiBaseUrl.replace(/^http/, "ws"));
    socketUrl.pathname = "/ws";
    socketUrl.searchParams.set("token", token);
    socketUrl.searchParams.set("documentId", documentId);
    return new WebSocket(socketUrl);
  }
};
