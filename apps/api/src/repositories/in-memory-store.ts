import crypto from "node:crypto";
import {
  type AiFeature,
  type AiInteraction,
  type AiInteractionStatus,
  type ApplyAiSuggestionRequest,
  type Document,
  type DocumentPermission,
  type DocumentRole,
  type DocumentSummary,
  type DocumentVersion,
  type PresenceParticipant,
  type SelectionRange,
  type Session,
  type ShareDocumentRequest,
  type User
} from "@midterm/shared";
import { AppError, assert } from "../utils/errors.js";

type MutableDocument = Document;

const rolePriority: Record<DocumentRole, number> = {
  viewer: 1,
  commenter: 2,
  editor: 3,
  owner: 4
};

function now() {
  return new Date().toISOString();
}

function excerpt(content: string) {
  return content.replace(/\s+/g, " ").trim().slice(0, 100);
}

function replaceSelection(content: string, selection: SelectionRange, replacement: string) {
  return `${content.slice(0, selection.start)}${replacement}${content.slice(selection.end)}`;
}

export class InMemoryStore {
  private readonly users = new Map<string, User>();
  private readonly sessions = new Map<string, Session>();
  private readonly documents = new Map<string, MutableDocument>();
  private readonly aiUsageCount = new Map<string, number>();

  constructor() {
    this.seed();
  }

  listUsers() {
    return [...this.users.values()];
  }

  getUser(userId: string) {
    return this.users.get(userId) ?? null;
  }

  createSession(userId: string) {
    const user = this.getUser(userId);
    assert(user, new AppError(404, "USER_NOT_FOUND", "The requested user does not exist."));

    const session: Session = {
      token: crypto.randomUUID(),
      userId,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString()
    };

    this.sessions.set(session.token, session);
    return { session, user };
  }

  getSession(token: string) {
    const session = this.sessions.get(token) ?? null;
    if (!session) {
      return null;
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      this.sessions.delete(token);
      return null;
    }

    return session;
  }

  getUserFromSession(token: string) {
    const session = this.getSession(token);
    if (!session) {
      return null;
    }

    const user = this.getUser(session.userId);
    if (!user) {
      this.sessions.delete(token);
      return null;
    }

    return { session, user };
  }

  listDocumentsForUser(userId: string): DocumentSummary[] {
    return [...this.documents.values()]
      .map((document) => {
        const callerRole = this.getDocumentRole(document, userId);
        if (!callerRole) {
          return null;
        }

        return {
          id: document.id,
          title: document.title,
          excerpt: excerpt(document.content),
          updatedAt: document.updatedAt,
          ownerId: document.ownerId,
          currentVersion: document.currentVersion,
          activeCollaboratorCount: document.activeCollaboratorCount,
          callerRole,
          pendingAiSuggestions: document.aiInteractions.filter((item) => item.status === "completed").length
        };
      })
      .filter((document): document is DocumentSummary => document !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  createDocument(ownerId: string, title: string, content: string) {
    const createdAt = now();
    const documentId = crypto.randomUUID();
    const permission: DocumentPermission = {
      id: crypto.randomUUID(),
      documentId,
      principalType: "user",
      principalId: ownerId,
      role: "owner",
      allowAi: true,
      createdAt
    };
    const version: DocumentVersion = {
      id: crypto.randomUUID(),
      documentId,
      versionNumber: 1,
      content,
      createdAt,
      createdBy: ownerId,
      reason: "Initial draft"
    };

    const document: MutableDocument = {
      id: documentId,
      title,
      content,
      createdAt,
      updatedAt: createdAt,
      ownerId,
      currentVersion: 1,
      activeCollaboratorCount: 0,
      permissions: [permission],
      versions: [version],
      aiInteractions: []
    };

    this.documents.set(document.id, document);
    return document;
  }

  getDocumentForUser(documentId: string, userId: string) {
    const document = this.documents.get(documentId) ?? null;
    assert(document, new AppError(404, "DOCUMENT_NOT_FOUND", "The document could not be found."));

    const role = this.getDocumentRole(document, userId);
    assert(role, new AppError(403, "FORBIDDEN", "You do not have access to this document."));

    return { document, role };
  }

  listVersions(documentId: string, userId: string) {
    const { document } = this.getDocumentForUser(documentId, userId);
    return [...document.versions].sort((left, right) => right.versionNumber - left.versionNumber);
  }

  updateDocumentContent(documentId: string, userId: string, baseVersion: number, content: string, reason: string) {
    const { document, role } = this.getDocumentForUser(documentId, userId);
    assert(
      rolePriority[role] >= rolePriority.editor,
      new AppError(403, "EDIT_NOT_ALLOWED", "Your role does not allow editing this document.")
    );

    assert(
      baseVersion === document.currentVersion,
      new AppError(
        409,
        "VERSION_CONFLICT",
        "The document changed while you were editing. Reload the latest content before saving."
      )
    );

    document.content = content;
    document.currentVersion += 1;
    document.updatedAt = now();

    const version: DocumentVersion = {
      id: crypto.randomUUID(),
      documentId,
      versionNumber: document.currentVersion,
      content,
      createdAt: document.updatedAt,
      createdBy: userId,
      reason
    };

    document.versions.push(version);
    return { document, savedVersion: version };
  }

  applyRealtimeChange(documentId: string, userId: string, baseVersion: number, content: string) {
    const { document, role } = this.getDocumentForUser(documentId, userId);
    assert(
      rolePriority[role] >= rolePriority.editor,
      new AppError(403, "EDIT_NOT_ALLOWED", "Your role does not allow editing this document.")
    );

    assert(
      baseVersion === document.currentVersion,
      new AppError(
        409,
        "VERSION_CONFLICT",
        "The real-time edit was based on stale content. The client should apply the latest snapshot first."
      )
    );

    document.content = content;
    document.currentVersion += 1;
    document.updatedAt = now();
    document.versions.push({
      id: crypto.randomUUID(),
      documentId,
      versionNumber: document.currentVersion,
      content,
      createdAt: document.updatedAt,
      createdBy: userId,
      reason: "Collaborative live edit"
    });

    return document;
  }

  revertDocument(documentId: string, userId: string, versionNumber: number) {
    const { document, role } = this.getDocumentForUser(documentId, userId);
    assert(
      rolePriority[role] >= rolePriority.editor,
      new AppError(403, "REVERT_NOT_ALLOWED", "Your role does not allow reverting document history.")
    );

    const targetVersion = document.versions.find((version) => version.versionNumber === versionNumber);
    assert(targetVersion, new AppError(404, "VERSION_NOT_FOUND", "The requested version does not exist."));

    return this.updateDocumentContent(documentId, userId, document.currentVersion, targetVersion.content, `Reverted to v${versionNumber}`);
  }

  shareDocument(documentId: string, userId: string, request: ShareDocumentRequest) {
    const { document, role } = this.getDocumentForUser(documentId, userId);
    assert(
      rolePriority[role] >= rolePriority.owner,
      new AppError(403, "SHARE_NOT_ALLOWED", "Only owners can modify document sharing.")
    );

    const existing = document.permissions.find(
      (permission) =>
        permission.principalType === request.principalType && permission.principalId === request.principalId
    );

    if (existing) {
      existing.role = request.role;
      existing.allowAi = request.allowAi;
      return existing;
    }

    const permission: DocumentPermission = {
      id: crypto.randomUUID(),
      documentId,
      principalType: request.principalType,
      principalId: request.principalId,
      role: request.role,
      allowAi: request.allowAi,
      createdAt: now()
    };
    document.permissions.push(permission);
    return permission;
  }

  setActiveCollaboratorCount(documentId: string, participants: PresenceParticipant[]) {
    const document = this.documents.get(documentId);
    if (!document) {
      return;
    }

    document.activeCollaboratorCount = participants.length;
  }

  listPermissions(documentId: string, userId: string) {
    const { document } = this.getDocumentForUser(documentId, userId);
    return document.permissions;
  }

  requestAiInteraction(
    documentId: string,
    userId: string,
    feature: AiFeature,
    selection: SelectionRange,
    sourceText: string,
    targetLanguage?: string
  ) {
    const { document } = this.getDocumentForUser(documentId, userId);
    const permission = this.getPermission(document, userId);
    assert(permission?.allowAi, new AppError(403, "AI_NOT_ALLOWED", "Your role cannot invoke the AI assistant here."));

    const usage = this.aiUsageCount.get(userId) ?? 0;
    if (usage >= 10) {
      const interaction: AiInteraction = {
        id: crypto.randomUUID(),
        documentId,
        feature,
        status: "quota_exceeded",
        initiatedBy: userId,
        selection,
        sourceText,
        suggestedText: "",
        targetLanguage,
        createdAt: now(),
        promptTemplateVersion: "v1.2",
        model: "mock-writer-pro",
        quotaConsumed: 0
      };
      document.aiInteractions.unshift(interaction);
      return interaction;
    }

    this.aiUsageCount.set(userId, usage + 1);

    const interaction: AiInteraction = {
      id: crypto.randomUUID(),
      documentId,
      feature,
      status: "queued",
      initiatedBy: userId,
      selection,
      sourceText,
      suggestedText: "",
      targetLanguage,
      createdAt: now(),
      promptTemplateVersion: "v1.2",
      model: "mock-writer-pro",
      quotaConsumed: 1
    };

    document.aiInteractions.unshift(interaction);
    return interaction;
  }

  completeAiInteraction(documentId: string, interactionId: string, suggestedText: string, status: AiInteractionStatus) {
    const document = this.documents.get(documentId) ?? null;
    assert(document, new AppError(404, "DOCUMENT_NOT_FOUND", "The document could not be found."));

    const interaction = document.aiInteractions.find((item) => item.id === interactionId);
    assert(interaction, new AppError(404, "AI_INTERACTION_NOT_FOUND", "The AI interaction does not exist."));

    interaction.suggestedText = suggestedText;
    interaction.status = status;
    interaction.completedAt = now();

    return interaction;
  }

  listAiInteractions(documentId: string, userId: string) {
    const { document } = this.getDocumentForUser(documentId, userId);
    return document.aiInteractions;
  }

  applyAiSuggestion(
    documentId: string,
    interactionId: string,
    userId: string,
    request: ApplyAiSuggestionRequest
  ) {
    const { document, role } = this.getDocumentForUser(documentId, userId);
    assert(
      rolePriority[role] >= rolePriority.editor,
      new AppError(403, "EDIT_NOT_ALLOWED", "Your role does not allow applying AI suggestions.")
    );

    const interaction = document.aiInteractions.find((item) => item.id === interactionId);
    assert(interaction, new AppError(404, "AI_INTERACTION_NOT_FOUND", "The AI suggestion does not exist."));
    assert(
      interaction.status === "completed",
      new AppError(409, "AI_NOT_READY", "Only completed AI suggestions can be applied.")
    );

    const acceptedText = request.acceptedText?.length ? request.acceptedText : interaction.suggestedText;
    document.content = replaceSelection(document.content, interaction.selection, acceptedText);
    document.currentVersion += 1;
    document.updatedAt = now();
    document.versions.push({
      id: crypto.randomUUID(),
      documentId,
      versionNumber: document.currentVersion,
      content: document.content,
      createdAt: document.updatedAt,
      createdBy: userId,
      reason: `Applied AI ${interaction.feature} suggestion`
    });
    interaction.status = request.mode === "manual_merge" ? "partially_applied" : "applied";
    interaction.completedAt = now();

    return { document, interaction };
  }

  rejectAiSuggestion(documentId: string, interactionId: string, userId: string) {
    const { document } = this.getDocumentForUser(documentId, userId);
    const interaction = document.aiInteractions.find((item) => item.id === interactionId);
    assert(interaction, new AppError(404, "AI_INTERACTION_NOT_FOUND", "The AI suggestion does not exist."));
    assert(
      interaction.status === "completed",
      new AppError(409, "AI_NOT_READY", "Only completed AI suggestions can be rejected.")
    );
    interaction.status = "rejected";
    interaction.completedAt = now();
    return interaction;
  }

  private getPermission(document: MutableDocument, userId: string) {
    return document.permissions.find(
      (permission) => permission.principalType === "user" && permission.principalId === userId
    ) ?? null;
  }

  private getDocumentRole(document: MutableDocument, userId: string): DocumentRole | null {
    return this.getPermission(document, userId)?.role ?? null;
  }

  private seed() {
    const users: User[] = [
      {
        id: "user-layla",
        email: "layla@collabwrite.dev",
        displayName: "Layla Hassan",
        role: "member",
        avatarColor: "#ff7043"
      },
      {
        id: "user-omar",
        email: "omar@collabwrite.dev",
        displayName: "Omar Nabil",
        role: "member",
        avatarColor: "#1e88e5"
      },
      {
        id: "user-sara",
        email: "sara@collabwrite.dev",
        displayName: "Sara Adel",
        role: "admin",
        avatarColor: "#43a047"
      },
      {
        id: "user-mona",
        email: "mona@collabwrite.dev",
        displayName: "Mona Ashraf",
        role: "member",
        avatarColor: "#8e24aa"
      }
    ];

    for (const user of users) {
      this.users.set(user.id, user);
    }

    const createdAt = now();
    const documentId = crypto.randomUUID();
    const content = [
      "# Product Launch Overview",
      "",
      "CollabWrite helps distributed teams co-author product strategy documents and keep AI assistance accountable.",
      "",
      "This draft still needs a tighter executive summary, a better rollout plan, and a concise list of launch risks."
    ].join("\n");

    const document: MutableDocument = {
      id: documentId,
      title: "Launch Plan Draft",
      content,
      createdAt,
      updatedAt: createdAt,
      ownerId: "user-layla",
      currentVersion: 1,
      activeCollaboratorCount: 0,
      permissions: [
        {
          id: crypto.randomUUID(),
          documentId,
          principalType: "user",
          principalId: "user-layla",
          role: "owner",
          allowAi: true,
          createdAt
        },
        {
          id: crypto.randomUUID(),
          documentId,
          principalType: "user",
          principalId: "user-omar",
          role: "editor",
          allowAi: true,
          createdAt
        },
        {
          id: crypto.randomUUID(),
          documentId,
          principalType: "user",
          principalId: "user-sara",
          role: "commenter",
          allowAi: true,
          createdAt
        },
        {
          id: crypto.randomUUID(),
          documentId,
          principalType: "user",
          principalId: "user-mona",
          role: "viewer",
          allowAi: false,
          createdAt
        }
      ],
      versions: [
        {
          id: crypto.randomUUID(),
          documentId,
          versionNumber: 1,
          content,
          createdAt,
          createdBy: "user-layla",
          reason: "Initial draft"
        }
      ],
      aiInteractions: []
    };

    this.documents.set(document.id, document);
  }
}
