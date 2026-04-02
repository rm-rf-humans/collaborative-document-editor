import { z } from "zod";

export const isoDateTimeSchema = z.iso.datetime();

export const globalUserRoleSchema = z.enum(["member", "admin"]);
export type GlobalUserRole = z.infer<typeof globalUserRoleSchema>;

export const documentRoleSchema = z.enum(["owner", "editor", "commenter", "viewer"]);
export type DocumentRole = z.infer<typeof documentRoleSchema>;

export const principalTypeSchema = z.enum(["user", "team", "link"]);
export type PrincipalType = z.infer<typeof principalTypeSchema>;

export const aiFeatureSchema = z.enum(["rewrite", "summarize", "translate", "restructure"]);
export type AiFeature = z.infer<typeof aiFeatureSchema>;

export const aiInteractionStatusSchema = z.enum([
  "queued",
  "in_progress",
  "completed",
  "failed",
  "applied",
  "partially_applied",
  "rejected",
  "quota_exceeded"
]);
export type AiInteractionStatus = z.infer<typeof aiInteractionStatusSchema>;

export const selectionRangeSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative()
}).refine((value) => value.end >= value.start, {
  message: "selection end must be greater than or equal to start"
});
export type SelectionRange = z.infer<typeof selectionRangeSchema>;

export const userSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  displayName: z.string().min(1),
  role: globalUserRoleSchema,
  avatarColor: z.string().min(1)
});
export type User = z.infer<typeof userSchema>;

export const sessionSchema = z.object({
  token: z.string().min(1),
  userId: z.string().min(1),
  expiresAt: isoDateTimeSchema
});
export type Session = z.infer<typeof sessionSchema>;

export const documentPermissionSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  principalType: principalTypeSchema,
  principalId: z.string().min(1),
  role: documentRoleSchema,
  allowAi: z.boolean(),
  createdAt: isoDateTimeSchema
});
export type DocumentPermission = z.infer<typeof documentPermissionSchema>;

export const documentVersionSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  versionNumber: z.number().int().positive(),
  content: z.string(),
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1),
  reason: z.string().min(1)
});
export type DocumentVersion = z.infer<typeof documentVersionSchema>;

export const aiInteractionSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  feature: aiFeatureSchema,
  status: aiInteractionStatusSchema,
  initiatedBy: z.string().min(1),
  selection: selectionRangeSchema,
  sourceText: z.string(),
  suggestedText: z.string(),
  targetLanguage: z.string().min(2).optional(),
  createdAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.optional(),
  promptTemplateVersion: z.string().min(1),
  model: z.string().min(1),
  quotaConsumed: z.number().nonnegative()
});
export type AiInteraction = z.infer<typeof aiInteractionSchema>;

export const documentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  content: z.string(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  ownerId: z.string().min(1),
  currentVersion: z.number().int().positive(),
  activeCollaboratorCount: z.number().int().nonnegative(),
  permissions: z.array(documentPermissionSchema),
  versions: z.array(documentVersionSchema),
  aiInteractions: z.array(aiInteractionSchema)
});
export type Document = z.infer<typeof documentSchema>;

export const documentSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  excerpt: z.string(),
  updatedAt: isoDateTimeSchema,
  ownerId: z.string().min(1),
  currentVersion: z.number().int().positive(),
  activeCollaboratorCount: z.number().int().nonnegative(),
  callerRole: documentRoleSchema,
  pendingAiSuggestions: z.number().int().nonnegative()
});
export type DocumentSummary = z.infer<typeof documentSummarySchema>;

export const authLoginRequestSchema = z.object({
  userId: z.string().min(1)
});
export type AuthLoginRequest = z.infer<typeof authLoginRequestSchema>;

export const authLoginResponseSchema = z.object({
  session: sessionSchema,
  user: userSchema
});
export type AuthLoginResponse = z.infer<typeof authLoginResponseSchema>;

export const authMeResponseSchema = z.object({
  session: sessionSchema,
  user: userSchema
});
export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;

export const createDocumentRequestSchema = z.object({
  title: z.string().min(1).max(120),
  content: z.string().default("")
});
export type CreateDocumentRequest = z.infer<typeof createDocumentRequestSchema>;

export const documentResponseSchema = z.object({
  document: documentSchema
});
export type DocumentResponse = z.infer<typeof documentResponseSchema>;

export const listDocumentsResponseSchema = z.object({
  documents: z.array(documentSummarySchema)
});
export type ListDocumentsResponse = z.infer<typeof listDocumentsResponseSchema>;

export const listUsersResponseSchema = z.object({
  users: z.array(userSchema)
});
export type ListUsersResponse = z.infer<typeof listUsersResponseSchema>;

export const updateDocumentContentRequestSchema = z.object({
  baseVersion: z.number().int().positive(),
  content: z.string(),
  cursor: z.number().int().nonnegative().optional(),
  reason: z.string().min(1).default("Manual edit")
});
export type UpdateDocumentContentRequest = z.infer<typeof updateDocumentContentRequestSchema>;

export const updateDocumentContentResponseSchema = z.object({
  document: documentSchema,
  savedVersion: documentVersionSchema
});
export type UpdateDocumentContentResponse = z.infer<typeof updateDocumentContentResponseSchema>;

export const listVersionsResponseSchema = z.object({
  versions: z.array(documentVersionSchema)
});
export type ListVersionsResponse = z.infer<typeof listVersionsResponseSchema>;

export const revertDocumentRequestSchema = z.object({
  versionNumber: z.number().int().positive()
});
export type RevertDocumentRequest = z.infer<typeof revertDocumentRequestSchema>;

export const shareDocumentRequestSchema = z.object({
  principalType: principalTypeSchema,
  principalId: z.string().min(1),
  role: documentRoleSchema,
  allowAi: z.boolean()
});
export type ShareDocumentRequest = z.infer<typeof shareDocumentRequestSchema>;

export const listPermissionsResponseSchema = z.object({
  permissions: z.array(documentPermissionSchema)
});
export type ListPermissionsResponse = z.infer<typeof listPermissionsResponseSchema>;

export const aiOperationRequestSchema = z.object({
  feature: aiFeatureSchema,
  selection: selectionRangeSchema,
  targetLanguage: z.string().min(2).optional(),
  instructions: z.string().max(500).optional()
});
export type AiOperationRequest = z.infer<typeof aiOperationRequestSchema>;

export const aiOperationResponseSchema = z.object({
  interaction: aiInteractionSchema
});
export type AiOperationResponse = z.infer<typeof aiOperationResponseSchema>;

export const listAiInteractionsResponseSchema = z.object({
  interactions: z.array(aiInteractionSchema)
});
export type ListAiInteractionsResponse = z.infer<typeof listAiInteractionsResponseSchema>;

export const applyAiSuggestionRequestSchema = z.object({
  mode: z.enum(["replace_selection", "manual_merge"]),
  acceptedText: z.string().optional()
});
export type ApplyAiSuggestionRequest = z.infer<typeof applyAiSuggestionRequestSchema>;

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean().default(false)
  })
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const presenceParticipantSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1),
  color: z.string().min(1),
  cursor: z.number().int().nonnegative().nullable(),
  connectedAt: isoDateTimeSchema
});
export type PresenceParticipant = z.infer<typeof presenceParticipantSchema>;

export const realtimeMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("presence.snapshot"),
    documentId: z.string().min(1),
    participants: z.array(presenceParticipantSchema),
    content: z.string(),
    version: z.number().int().positive()
  }),
  z.object({
    type: z.literal("presence.updated"),
    documentId: z.string().min(1),
    participants: z.array(presenceParticipantSchema)
  }),
  z.object({
    type: z.literal("document.updated"),
    documentId: z.string().min(1),
    content: z.string(),
    version: z.number().int().positive(),
    updatedBy: z.string().min(1)
  }),
  z.object({
    type: z.literal("ai.completed"),
    documentId: z.string().min(1),
    interaction: aiInteractionSchema
  }),
  z.object({
    type: z.literal("cursor.updated"),
    documentId: z.string().min(1),
    userId: z.string().min(1),
    cursor: z.number().int().nonnegative().nullable()
  })
]);
export type RealtimeMessage = z.infer<typeof realtimeMessageSchema>;

export const realtimeClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("document.change"),
    documentId: z.string().min(1),
    content: z.string(),
    baseVersion: z.number().int().positive(),
    cursor: z.number().int().nonnegative().nullable()
  }),
  z.object({
    type: z.literal("cursor.change"),
    documentId: z.string().min(1),
    cursor: z.number().int().nonnegative().nullable()
  })
]);
export type RealtimeClientMessage = z.infer<typeof realtimeClientMessageSchema>;

export function selectionToText(content: string, selection: SelectionRange): string {
  return content.slice(selection.start, selection.end);
}
