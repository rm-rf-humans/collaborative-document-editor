import { authLoginResponseSchema, authMeResponseSchema, aiOperationResponseSchema, documentResponseSchema, listAiInteractionsResponseSchema, listDocumentsResponseSchema, listPermissionsResponseSchema, listUsersResponseSchema, listVersionsResponseSchema, updateDocumentContentResponseSchema } from "@midterm/shared";
const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
async function request(path, options = {}, parser) {
    const response = await fetch(`${apiBaseUrl}${path}`, {
        method: options.method ?? "GET",
        headers: {
            "content-type": "application/json",
            ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    const payload = await response.json();
    if (!response.ok) {
        throw new Error(payload.error?.message ?? "Request failed");
    }
    return parser.parse(payload);
}
export const api = {
    listUsers() {
        return request("/v1/users", {}, listUsersResponseSchema);
    },
    login(userId) {
        return request("/v1/auth/login", { method: "POST", body: { userId } }, authLoginResponseSchema);
    },
    me(token) {
        return request("/v1/auth/me", { token }, authMeResponseSchema);
    },
    listDocuments(token) {
        return request("/v1/documents", { token }, listDocumentsResponseSchema);
    },
    createDocument(token, body) {
        return request("/v1/documents", { method: "POST", token, body }, documentResponseSchema);
    },
    getDocument(token, documentId) {
        return request(`/v1/documents/${documentId}`, { token }, documentResponseSchema);
    },
    updateDocument(token, documentId, body) {
        return request(`/v1/documents/${documentId}/content`, { method: "PUT", token, body }, updateDocumentContentResponseSchema);
    },
    listVersions(token, documentId) {
        return request(`/v1/documents/${documentId}/versions`, { token }, listVersionsResponseSchema);
    },
    revertDocument(token, documentId, body) {
        return request(`/v1/documents/${documentId}/revert`, { method: "POST", token, body }, updateDocumentContentResponseSchema);
    },
    listPermissions(token, documentId) {
        return request(`/v1/documents/${documentId}/permissions`, { token }, listPermissionsResponseSchema);
    },
    shareDocument(token, documentId, body) {
        return request(`/v1/documents/${documentId}/share`, { method: "POST", token, body }, listPermissionsResponseSchema);
    },
    listAiInteractions(token, documentId) {
        return request(`/v1/documents/${documentId}/ai-interactions`, { token }, listAiInteractionsResponseSchema);
    },
    requestAi(token, documentId, body) {
        return request(`/v1/documents/${documentId}/ai-operations`, { method: "POST", token, body }, aiOperationResponseSchema);
    },
    applyAi(token, documentId, interactionId, body) {
        return request(`/v1/documents/${documentId}/ai-interactions/${interactionId}/apply`, { method: "POST", token, body }, documentResponseSchema);
    },
    rejectAi(token, documentId, interactionId) {
        return request(`/v1/documents/${documentId}/ai-interactions/${interactionId}/reject`, { method: "POST", token, body: {} }, listAiInteractionsResponseSchema);
    },
    createRealtimeSocket(token, documentId) {
        const socketUrl = new URL(apiBaseUrl.replace(/^http/, "ws"));
        socketUrl.pathname = "/ws";
        socketUrl.searchParams.set("token", token);
        socketUrl.searchParams.set("documentId", documentId);
        return new WebSocket(socketUrl);
    }
};
