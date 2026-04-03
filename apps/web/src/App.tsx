import { startTransition, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import {
  type AiInteraction,
  type AiProviderStatus,
  type Document,
  type DocumentPermission,
  type DocumentRole,
  type DocumentSummary,
  type DocumentVersion,
  type ExportFormat,
  type PresenceParticipant,
  type RealtimeMessage,
  type SelectionRange,
  type User
} from "@midterm/shared";
import { ApiError, api } from "./api";
import { formatAiCompletionStatus, formatAiRequestSubmitted, previewSelection, roleCanEdit, roleCanManage, roleCanUseAi } from "./app-helpers";
import { LoginView } from "./components/LoginView";
import { Sidebar } from "./components/Sidebar";
import { EditorPanel } from "./components/EditorPanel";
import { InspectorPanel } from "./components/InspectorPanel";
import "./styles/app.css";

const sessionStorageKey = "collabwrite-session-token";
type SocketErrorPayload = { error: { message?: string; code?: string } };

function isUnauthorizedError(error: unknown) {
  return error instanceof ApiError && error.code === "UNAUTHORIZED";
}

export default function App() {
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [document, setDocument] = useState<Document | null>(null);
  const [permissions, setPermissions] = useState<DocumentPermission[]>([]);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [aiInteractions, setAiInteractions] = useState<AiInteraction[]>([]);
  const [aiProvider, setAiProvider] = useState<AiProviderStatus | null>(null);
  const [participants, setParticipants] = useState<PresenceParticipant[]>([]);
  const [selection, setSelection] = useState<SelectionRange>({ start: 0, end: 0 });
  const [socketConnected, setSocketConnected] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("Loading users...");
  const [shareTargetUserId, setShareTargetUserId] = useState("");
  const [shareRole, setShareRole] = useState<DocumentRole>("viewer");
  const [shareAllowAi, setShareAllowAi] = useState(false);
  const [aiTargetLanguage, setAiTargetLanguage] = useState("Arabic");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("pdf");
  const [includeAiAppendix, setIncludeAiAppendix] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const serverVersionRef = useRef<number>(1);
  const serverContentRef = useRef<string>("");

  const currentPermission = useMemo(() => {
    if (!currentUser) {
      return undefined;
    }
    return permissions.find((permission) => permission.principalId === currentUser.id);
  }, [currentUser, permissions]);

  const currentRole = currentPermission?.role;
  const canEdit = roleCanEdit(currentRole);
  const canManageSharing = roleCanManage(currentRole);
  const canUseAi = roleCanUseAi(currentPermission);
  const canExport = Boolean(document && sessionToken);
  const selectionLabel = previewSelection(document?.content ?? "", selection);
  const clearSession = useEffectEvent((message: string) => {
    window.localStorage.removeItem(sessionStorageKey);
    setCurrentUser(null);
    setSessionToken(null);
    setSelectedDocumentId(null);
    setDocument(null);
    setDocuments([]);
    setPermissions([]);
    setVersions([]);
    setAiInteractions([]);
    setParticipants([]);
    setAiProvider(null);
    serverVersionRef.current = 1;
    serverContentRef.current = "";
    setStatusMessage(message);
  });

  const refreshDocuments = useEffectEvent(async (token: string, preferredDocumentId?: string | null) => {
    const response = await api.listDocuments(token);
    startTransition(() => {
      setDocuments(response.documents);
    });
    const nextDocumentId = preferredDocumentId ?? selectedDocumentId ?? response.documents[0]?.id ?? null;
    if (nextDocumentId && nextDocumentId !== selectedDocumentId) {
      setSelectedDocumentId(nextDocumentId);
    }
  });

  const loadWorkspace = useEffectEvent(async (token: string, documentId: string) => {
    const [docResponse, versionResponse, permissionResponse, aiResponse] = await Promise.all([
      api.getDocument(token, documentId),
      api.listVersions(token, documentId),
      api.listPermissions(token, documentId),
      api.listAiInteractions(token, documentId)
    ]);

    startTransition(() => {
      setDocument(docResponse.document);
      setVersions(versionResponse.versions);
      setPermissions(permissionResponse.permissions);
      setAiInteractions(aiResponse.interactions);
      setSelection({ start: 0, end: 0 });
    });

    serverVersionRef.current = docResponse.document.currentVersion;
    serverContentRef.current = docResponse.document.content;
    if (!shareTargetUserId && currentUser) {
      const shareCandidate = availableUsers.find((user) => user.id !== currentUser.id);
      setShareTargetUserId(shareCandidate?.id ?? "");
    }
  });

  const handleSocketPayload = useEffectEvent(async (payload: RealtimeMessage | SocketErrorPayload) => {
    if ("error" in payload) {
      setStatusMessage(payload.error.message ?? "A collaboration event failed.");
      if (sessionToken && selectedDocumentId) {
        await loadWorkspace(sessionToken, selectedDocumentId);
      }
      return;
    }

    if (payload.type === "presence.snapshot") {
      setParticipants(payload.participants);
      setDocument((previous) => previous && previous.id === payload.documentId
        ? { ...previous, content: payload.content, currentVersion: payload.version }
        : previous
      );
      serverVersionRef.current = payload.version;
      serverContentRef.current = payload.content;
      return;
    }

    if (payload.type === "presence.updated") {
      setParticipants(payload.participants);
      return;
    }

    if (payload.type === "document.updated") {
      setDocument((previous) => previous && previous.id === payload.documentId
        ? { ...previous, content: payload.content, currentVersion: payload.version, updatedAt: new Date().toISOString() }
        : previous
      );
      serverVersionRef.current = payload.version;
      serverContentRef.current = payload.content;
      if (currentUser && payload.updatedBy !== currentUser.id) {
        setStatusMessage("Another collaborator updated the shared draft.");
      }
      if (sessionToken) {
        await refreshDocuments(sessionToken, payload.documentId);
      }
      return;
    }

    if (payload.type === "ai.completed") {
      setAiInteractions((previous) => {
        const next = previous.filter((item) => item.id !== payload.interaction.id);
        return [payload.interaction, ...next];
      });
      setStatusMessage(formatAiCompletionStatus(payload.interaction));
      return;
    }
  });

  useEffect(() => {
    api.listUsers()
      .then(async (response) => {
        setAvailableUsers(response.users);
        const persistedToken = window.localStorage.getItem(sessionStorageKey);
        if (!persistedToken) {
          setStatusMessage("Select a seeded user to enter the workspace.");
          return;
        }

        try {
          const { user } = await api.me(persistedToken);
          setSessionToken(persistedToken);
          setCurrentUser(user);
          setStatusMessage(`Welcome back, ${user.displayName}.`);
        } catch (error) {
          if (isUnauthorizedError(error)) {
            clearSession("Your previous session expired. Select a user to sign in again.");
            return;
          }

          clearSession("Unable to restore the previous session.");
        }
      })
      .catch(() => {
        setStatusMessage("Unable to load the API. Start the backend before opening the PoC.");
      });
  }, []);

  useEffect(() => {
    if (!sessionToken || !currentUser) {
      return;
    }

    api.getAiProvider(sessionToken)
      .then((response) => {
        setAiProvider(response.provider);
      })
      .catch((error) => {
        if (isUnauthorizedError(error)) {
          clearSession("Your session expired. Select a user to sign in again.");
          return;
        }
        setAiProvider(null);
      });

    refreshDocuments(sessionToken).catch((error) => {
      if (isUnauthorizedError(error)) {
        clearSession("Your session expired. Select a user to sign in again.");
        return;
      }
      setStatusMessage("Unable to load documents.");
    });
  }, [currentUser, sessionToken]);

  useEffect(() => {
    if (!sessionToken || !selectedDocumentId) {
      return;
    }

    loadWorkspace(sessionToken, selectedDocumentId).catch((error) => {
      if (isUnauthorizedError(error)) {
        clearSession("Your session expired. Select a user to sign in again.");
        return;
      }
      setStatusMessage("Unable to load the selected document.");
    });
  }, [selectedDocumentId, sessionToken]);

  useEffect(() => {
    if (!sessionToken || !selectedDocumentId) {
      return;
    }

    let closed = false;

    const connect = () => {
      const socket = api.createRealtimeSocket(sessionToken, selectedDocumentId);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        setSocketConnected(true);
      });

      socket.addEventListener("message", (event: MessageEvent<string>) => {
        const payload = JSON.parse(event.data) as RealtimeMessage | SocketErrorPayload;
        handleSocketPayload(payload);
      });

      socket.addEventListener("close", () => {
        setSocketConnected(false);
        if (closed) {
          return;
        }
        reconnectTimerRef.current = window.setTimeout(connect, 1500);
      });
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      socketRef.current?.close();
      socketRef.current = null;
      setParticipants([]);
      setSocketConnected(false);
    };
  }, [selectedDocumentId, sessionToken]);

  useEffect(() => {
    if (!document || !canEdit || !socketConnected || !socketRef.current) {
      return;
    }

    if (document.content === serverContentRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      socketRef.current?.send(JSON.stringify({
        type: "document.change",
        documentId: document.id,
        content: document.content,
        baseVersion: serverVersionRef.current,
        cursor: selection.end
      }));
    }, 350);

    return () => window.clearTimeout(timer);
  }, [canEdit, document, selection.end, socketConnected]);

  const handleSelectionChange = (start: number, end: number) => {
    setSelection({ start, end });
    socketRef.current?.send(JSON.stringify({
      type: "cursor.change",
      documentId: selectedDocumentId,
      cursor: end
    }));
  };

  const handleLogin = async (userId: string) => {
    setIsBusy(true);
    try {
      const response = await api.login(userId);
      setCurrentUser(response.user);
      setSessionToken(response.session.token);
      window.localStorage.setItem(sessionStorageKey, response.session.token);
      setStatusMessage(`Logged in as ${response.user.displayName}.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateDocument = async (title: string) => {
    if (!sessionToken) {
      return false;
    }

    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setStatusMessage("Enter a title before creating a document.");
      return false;
    }

    setIsBusy(true);
    try {
      const response = await api.createDocument(sessionToken, {
        title: normalizedTitle,
        content: "Start writing here..."
      });
      await refreshDocuments(sessionToken, response.document.id);
      setSelectedDocumentId(response.document.id);
      setStatusMessage(`Created "${response.document.title}".`);
      return true;
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Document creation failed.");
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  const handleShare = async () => {
    if (!sessionToken || !document || !shareTargetUserId) {
      return;
    }

    try {
      const response = await api.shareDocument(sessionToken, document.id, {
        principalType: "user",
        principalId: shareTargetUserId,
        role: shareRole,
        allowAi: shareAllowAi
      });
      setPermissions(response.permissions);
      setStatusMessage("Sharing updated.");
      await refreshDocuments(sessionToken, document.id);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Sharing update failed.");
    }
  };

  const handleRequestAi = async (feature: "rewrite" | "summarize" | "translate" | "restructure" | "proofread" | "complete") => {
    if (!sessionToken || !document) {
      return;
    }

    if (feature !== "complete" && selection.start === selection.end) {
      setStatusMessage("Select some text before invoking the AI assistant.");
      return;
    }

    try {
      const response = await api.requestAi(sessionToken, document.id, {
        feature,
        selection,
        targetLanguage: feature === "translate" ? aiTargetLanguage : undefined
      });
      setAiInteractions((previous) => [response.interaction, ...previous]);
      setStatusMessage(response.interaction.status === "quota_exceeded"
        ? "AI quota exceeded for this user."
        : formatAiRequestSubmitted(feature)
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "AI request failed.");
    }
  };

  const handleExportDocument = async () => {
    if (!sessionToken || !document) {
      return;
    }

    setIsBusy(true);
    try {
      const artifact = await api.exportDocument(sessionToken, document.id, {
        format: exportFormat,
        includeAiAppendix
      });
      const downloadUrl = window.URL.createObjectURL(artifact.blob);
      const link = window.document.createElement("a");
      link.href = downloadUrl;
      link.download = artifact.filename;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      setStatusMessage(`Exported ${artifact.filename}.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleApplySuggestion = async (interactionId: string) => {
    if (!sessionToken || !document) {
      return;
    }

    try {
      const response = await api.applyAi(sessionToken, document.id, interactionId, {
        mode: "replace_selection"
      });
      setDocument(response.document);
      await loadWorkspace(sessionToken, document.id);
      setStatusMessage("AI suggestion applied.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to apply AI suggestion.");
    }
  };

  const handleRejectSuggestion = async (interactionId: string) => {
    if (!sessionToken || !document) {
      return;
    }

    try {
      const response = await api.rejectAi(sessionToken, document.id, interactionId);
      setAiInteractions(response.interactions);
      setStatusMessage("AI suggestion rejected.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to reject AI suggestion.");
    }
  };

  const handleRevertVersion = async (versionNumber: number) => {
    if (!sessionToken || !document) {
      return;
    }

    try {
      const response = await api.revertDocument(sessionToken, document.id, { versionNumber });
      setDocument(response.document);
      await loadWorkspace(sessionToken, document.id);
      setStatusMessage(`Reverted to version ${versionNumber}.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Version revert failed.");
    }
  };

  if (!currentUser || !sessionToken) {
    return <LoginView users={availableUsers} onLogin={handleLogin} loading={isBusy} />;
  }

  return (
    <main className="app-shell">
      <Sidebar
        currentUserName={currentUser.displayName}
        documents={documents}
        selectedDocumentId={selectedDocumentId}
        onCreateDocument={handleCreateDocument}
        onSelectDocument={setSelectedDocumentId}
      />

      <section className="workspace">
        <header className="workspace-banner">
          <div>
            <p className="eyebrow">Session</p>
            <h1>Collaborative Editor</h1>
          </div>
          <p>{statusMessage}</p>
        </header>

        <div className="workspace-grid">
          <EditorPanel
            canEdit={canEdit}
            document={document}
            onChange={(content) => setDocument((previous) => previous ? { ...previous, content } : previous)}
            onSelectionChange={handleSelectionChange}
            participants={participants}
            selectionLabel={selectionLabel}
            socketConnected={socketConnected}
            textareaRef={textareaRef}
          />

          <InspectorPanel
            aiInteractions={aiInteractions}
            aiProvider={aiProvider}
            aiTargetLanguage={aiTargetLanguage}
            availableUsers={availableUsers.filter((user) => user.id !== currentUser.id)}
            canExport={canExport && !isBusy}
            canManageSharing={canManageSharing}
            canUseAi={canUseAi}
            exportFormat={exportFormat}
            includeAiAppendix={includeAiAppendix}
            onAiTargetLanguageChange={setAiTargetLanguage}
            onApplySuggestion={handleApplySuggestion}
            onExportDocument={handleExportDocument}
            onExportFormatChange={setExportFormat}
            onIncludeAiAppendixChange={setIncludeAiAppendix}
            onRejectSuggestion={handleRejectSuggestion}
            onRequestAi={handleRequestAi}
            onRevertVersion={handleRevertVersion}
            onShareAllowAiChange={setShareAllowAi}
            onShareRoleChange={setShareRole}
            onShareSubmit={handleShare}
            onShareTargetUserIdChange={setShareTargetUserId}
            permissions={permissions}
            shareAllowAi={shareAllowAi}
            shareRole={shareRole}
            shareTargetUserId={shareTargetUserId}
            versions={versions}
          />
        </div>
      </section>
    </main>
  );
}
