import { WebSocket, WebSocketServer } from "ws";
import {
  type AiInteraction,
  realtimeClientMessageSchema,
  type PresenceParticipant,
  type RealtimeMessage
} from "@midterm/shared";
import { AuthService } from "../services/auth-service.js";
import { DocumentService } from "../services/document-service.js";
import { AppError } from "../utils/errors.js";

type SocketState = {
  documentId: string;
  userId: string;
  socket: WebSocket;
  participant: PresenceParticipant;
};

export class CollaborationHub {
  private readonly connections = new Map<string, Set<SocketState>>();

  constructor(
    private readonly auth: AuthService,
    private readonly documents: DocumentService
  ) {}

  attach(server: import("node:http").Server) {
    const webSocketServer = new WebSocketServer({
      server,
      path: "/ws"
    });

    webSocketServer.on("connection", (socket, request) => {
      try {
        const url = new URL(request.url ?? "", "http://localhost");
        const token = url.searchParams.get("token") ?? "";
        const documentId = url.searchParams.get("documentId") ?? "";

        const { user } = this.auth.requireUserByToken(token);
        const document = this.documents.getDocument(documentId, user.id);

        const state: SocketState = {
          documentId,
          userId: user.id,
          socket,
          participant: {
            userId: user.id,
            displayName: user.displayName,
            color: user.avatarColor,
            cursor: null,
            connectedAt: new Date().toISOString()
          }
        };

        const room = this.getRoom(documentId);
        room.add(state);
        this.pushPresence(documentId);
        this.documents.setActiveCollaboratorCount(documentId, this.getParticipants(documentId));

        const snapshot: RealtimeMessage = {
          type: "presence.snapshot",
          documentId,
          participants: this.getParticipants(documentId),
          content: document.content,
          version: document.currentVersion
        };
        socket.send(JSON.stringify(snapshot));

        socket.on("message", (rawMessage) => {
          try {
            const payload = realtimeClientMessageSchema.parse(JSON.parse(String(rawMessage)));
            if (payload.documentId !== documentId) {
              throw new AppError(400, "DOCUMENT_MISMATCH", "The socket event targeted the wrong document.");
            }

            if (payload.type === "cursor.change") {
              state.participant.cursor = payload.cursor;
              this.pushPresence(documentId);
              return;
            }

            const updatedDocument = this.documents.applyRealtimeChange(
              documentId,
              user.id,
              payload.baseVersion,
              payload.content
            );
            state.participant.cursor = payload.cursor;

            this.broadcast(documentId, {
              type: "document.updated",
              documentId,
              content: updatedDocument.content,
              version: updatedDocument.currentVersion,
              updatedBy: user.id
            });
            this.pushPresence(documentId);
          } catch (error) {
            const appError = error instanceof AppError
              ? error
              : new AppError(400, "INVALID_SOCKET_MESSAGE", "The socket message could not be processed.");

            socket.send(JSON.stringify({
              error: {
                code: appError.code,
                message: appError.message,
                retryable: appError.retryable
              }
            }));
          }
        });

        socket.on("close", () => {
          room.delete(state);
          if (room.size === 0) {
            this.connections.delete(documentId);
          }
          this.documents.setActiveCollaboratorCount(documentId, this.getParticipants(documentId));
          this.pushPresence(documentId);
        });
      } catch (error) {
        const appError = error instanceof AppError
          ? error
          : new AppError(401, "UNAUTHORIZED_SOCKET", "The socket connection is not authorized.");
        socket.send(JSON.stringify({
          error: {
            code: appError.code,
            message: appError.message,
            retryable: appError.retryable
          }
        }));
        socket.close();
      }
    });

    return webSocketServer;
  }

  broadcastAiCompletion(documentId: string, interaction: AiInteraction) {
    this.broadcast(documentId, {
      type: "ai.completed",
      documentId,
      interaction
    });
  }

  broadcastDocumentUpdate(documentId: string, content: string, version: number, updatedBy: string) {
    this.broadcast(documentId, {
      type: "document.updated",
      documentId,
      content,
      version,
      updatedBy
    });
  }

  private pushPresence(documentId: string) {
    const participants = this.getParticipants(documentId);
    this.broadcast(documentId, {
      type: "presence.updated",
      documentId,
      participants
    });
  }

  private getRoom(documentId: string) {
    let room = this.connections.get(documentId);
    if (!room) {
      room = new Set<SocketState>();
      this.connections.set(documentId, room);
    }

    return room;
  }

  private getParticipants(documentId: string): PresenceParticipant[] {
    const room = this.connections.get(documentId);
    if (!room) {
      return [];
    }

    const deduplicated = new Map<string, PresenceParticipant>();
    for (const connection of room) {
      deduplicated.set(connection.userId, connection.participant);
    }
    return [...deduplicated.values()];
  }

  private broadcast(documentId: string, message: RealtimeMessage) {
    const room = this.connections.get(documentId);
    if (!room) {
      return;
    }

    const serialized = JSON.stringify(message);
    for (const connection of room) {
      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.send(serialized);
      }
    }
  }
}
