import { startTransition, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import {
  type AiInteraction,
  type Document,
  type DocumentPermission,
  type DocumentRole,
  type DocumentSummary,
  type DocumentVersion,
  type PresenceParticipant,
  type RealtimeMessage,
  type SelectionRange,
  type User
} from "@midterm/shared";
import { api } from "./api";
import { LoginView } from "./components/LoginView";
import { Sidebar } from "./components/Sidebar";
import { EditorPanel } from "./components/EditorPanel";
import { InspectorPanel } from "./components/InspectorPanel";
import "./styles/app.css";

const sessionStorageKey = "collabwrite-session-token";
type SocketErrorPayload = { error: { message?: string; code?: string } };

function roleCanEdit(role?: DocumentRole) {
  return role === "owner" || role === "editor";
}

function roleCanManage(role?: DocumentRole) {
  return role === "owner";
}

function roleCanUseAi(permission?: DocumentPermission) {
  return Boolean(permission?.allowAi);
}

function previewSelection(content: string, selection: SelectionRange) {
  if (selection.start === selection.end) {
    return "Select text in the editor to invoke AI on a scoped region.";
  }

  const text = content.slice(selection.start, selection.end).replace(/\s+/g, " ").trim();
  return `Selected ${selection.end - selection.start} chars: "${text.slice(0, 100)}${text.length > 100 ? "..." : ""}"`;
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
  const [participants, setParticipants] = useState<PresenceParticipant[]>([]);
  const [selection, setSelection] = useState<SelectionRange>({ start: 0, end: 0 });
  const [socketConnected, setSocketConnected] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("Loading users...");
  const [shareTargetUserId, setShareTargetUserId] = useState("");
  const [shareRole, setShareRole] = useState<DocumentRole>("viewer");
  const [shareAllowAi, setShareAllowAi] = useState(false);
  const [aiTargetLanguage, setAiTargetLanguage] = useState("Arabic");
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
  const selectionLabel = previewSelection(document?.content ?? "", selection);

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
      setStatusMessage(`AI ${payload.interaction.feature} suggestion is ready.`);
      return;
    }
  });

  useEffect(() => {
    api.listUsers()
      .then((response) => {
        setAvailableUsers(response.users);
        const persistedToken = window.localStorage.getItem(sessionStorageKey);
        if (!persistedToken) {
          setStatusMessage("Select a seeded user to enter the workspace.");
          return;
        }

        setSessionToken(persistedToken);
        return api.me(persistedToken).then(({ user }) => {
          setCurrentUser(user);
          setStatusMessage(`Welcome back, ${user.displayName}.`);
        });
      })
      .catch(() => {
        setStatusMessage("Unable to load the API. Start the backend before opening the PoC.");
      });
  }, []);

  useEffect(() => {
    if (!sessionToken || !currentUser) {
      return;
    }

    refreshDocuments(sessionToken).catch(() => {
      setStatusMessage("Unable to load documents.");
    });
  }, [currentUser, refreshDocuments, sessionToken]);

  useEffect(() => {
    if (!sessionToken || !selectedDocumentId) {
      return;
    }

    loadWorkspace(sessionToken, selectedDocumentId).catch(() => {
      setStatusMessage("Unable to load the selected document.");
    });
  }, [loadWorkspace, selectedDocumentId, sessionToken]);

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
  }, [handleSocketPayload, selectedDocumentId, sessionToken]);

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

  const handleCreateDocument = async () => {
    if (!sessionToken) {
      return;
    }

    const title = window.prompt("Document title", "New collaborative draft");
    if (!title) {
      return;
    }

    setIsBusy(true);
    try {
      const response = await api.createDocument(sessionToken, {
        title,
        content: "Start writing here..."
      });
      await refreshDocuments(sessionToken, response.document.id);
      setSelectedDocumentId(response.document.id);
      setStatusMessage(`Created "${response.document.title}".`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Document creation failed.");
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

  const handleRequestAi = async (feature: "rewrite" | "summarize" | "translate" | "restructure") => {
    if (!sessionToken || !document) {
      return;
    }

    if (selection.start === selection.end) {
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
        ? "AI quota exceeded for this user in the PoC."
        : `AI ${feature} request submitted.`
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "AI request failed.");
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
            aiTargetLanguage={aiTargetLanguage}
            availableUsers={availableUsers.filter((user) => user.id !== currentUser.id)}
            canManageSharing={canManageSharing}
            canUseAi={canUseAi}
            onAiTargetLanguageChange={setAiTargetLanguage}
            onApplySuggestion={handleApplySuggestion}
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
