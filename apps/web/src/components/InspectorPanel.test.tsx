import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AiInteraction, AiProviderStatus, DocumentPermission, DocumentVersion, User } from "@midterm/shared";
import { InspectorPanel } from "./InspectorPanel";

const availableUsers: User[] = [
  {
    id: "user-omar",
    email: "omar@collabwrite.dev",
    displayName: "Omar Nabil",
    role: "member",
    avatarColor: "#1e88e5"
  },
  {
    id: "user-mona",
    email: "mona@collabwrite.dev",
    displayName: "Mona Ashraf",
    role: "member",
    avatarColor: "#8e24aa"
  }
];

const permissions: DocumentPermission[] = [
  {
    id: "perm-owner",
    documentId: "doc-1",
    principalType: "user",
    principalId: "user-layla",
    role: "owner",
    allowAi: true,
    createdAt: "2026-04-03T10:00:00.000Z"
  },
  {
    id: "perm-viewer",
    documentId: "doc-1",
    principalType: "user",
    principalId: "user-mona",
    role: "viewer",
    allowAi: false,
    createdAt: "2026-04-03T10:00:00.000Z"
  }
];

const versions: DocumentVersion[] = [
  {
    id: "version-2",
    documentId: "doc-1",
    versionNumber: 2,
    content: "Updated launch summary",
    createdAt: "2026-04-03T10:15:00.000Z",
    createdBy: "user-layla",
    reason: "Tightened the intro"
  }
];

const aiInteractions: AiInteraction[] = [
  {
    id: "ai-1",
    documentId: "doc-1",
    feature: "rewrite",
    status: "completed",
    initiatedBy: "user-layla",
    selection: { start: 0, end: 12 },
    sourceText: "Initial draft",
    suggestedText: "Sharper launch summary",
    targetLanguage: undefined,
    createdAt: "2026-04-03T10:20:00.000Z",
    requestedVersion: 2,
    completedAt: "2026-04-03T10:20:02.000Z",
    promptTemplateVersion: "v1.2",
    model: "mock-writer-pro",
    quotaConsumed: 1
  }
];

const provider: AiProviderStatus = {
  mode: "openai",
  live: true,
  fastModel: "gpt-4.1-mini",
  qualityModel: "gpt-4.1",
  message: "Live OpenAI suggestions are enabled via the Responses API."
};

function renderInspector(overrides: Partial<React.ComponentProps<typeof InspectorPanel>> = {}) {
  return render(
    <InspectorPanel
      aiInteractions={aiInteractions}
      aiProvider={provider}
      aiTargetLanguage="Arabic"
      availableUsers={availableUsers}
      canExport
      canManageSharing
      canUseAi
      exportFormat="pdf"
      includeAiAppendix
      onAiTargetLanguageChange={vi.fn()}
      onApplySuggestion={vi.fn()}
      onExportDocument={vi.fn()}
      onExportFormatChange={vi.fn()}
      onIncludeAiAppendixChange={vi.fn()}
      onRejectSuggestion={vi.fn()}
      onRequestAi={vi.fn()}
      onRevertVersion={vi.fn()}
      onShareAllowAiChange={vi.fn()}
      onShareRoleChange={vi.fn()}
      onShareSubmit={vi.fn()}
      onShareTargetUserIdChange={vi.fn()}
      permissions={permissions}
      shareAllowAi={false}
      shareRole="viewer"
      shareTargetUserId="user-omar"
      versions={versions}
      {...overrides}
    />
  );
}

describe("InspectorPanel", () => {
  it("wires AI, sharing, and version callbacks for owners", () => {
    const onRequestAi = vi.fn();
    const onApplySuggestion = vi.fn();
    const onRejectSuggestion = vi.fn();
    const onRevertVersion = vi.fn();
    const onExportDocument = vi.fn();
    const onExportFormatChange = vi.fn();
    const onIncludeAiAppendixChange = vi.fn();
    const onShareTargetUserIdChange = vi.fn();
    const onShareRoleChange = vi.fn();
    const onShareAllowAiChange = vi.fn();
    const onShareSubmit = vi.fn();
    const onAiTargetLanguageChange = vi.fn();

    renderInspector({
      onRequestAi,
      onApplySuggestion,
      onRejectSuggestion,
      onRevertVersion,
      onExportDocument,
      onExportFormatChange,
      onIncludeAiAppendixChange,
      onShareTargetUserIdChange,
      onShareRoleChange,
      onShareAllowAiChange,
      onShareSubmit,
      onAiTargetLanguageChange
    });

    fireEvent.click(screen.getByRole("button", { name: /Rewrite/i }));
    fireEvent.click(screen.getByRole("button", { name: /Proofread/i }));
    fireEvent.click(screen.getByRole("button", { name: /Continue Writing/i }));
    fireEvent.change(screen.getByLabelText("Translate Target"), { target: { value: "French" } });
    fireEvent.click(screen.getByRole("button", { name: /Translate Selection/i }));
    fireEvent.change(screen.getByLabelText("Format"), { target: { value: "markdown" } });
    fireEvent.click(screen.getByLabelText(/Attach AI history appendix/i));
    fireEvent.click(screen.getByRole("button", { name: /Export Document/i }));
    fireEvent.change(screen.getByLabelText("User"), { target: { value: "user-mona" } });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "editor" } });
    fireEvent.click(screen.getByLabelText(/Allow AI for this principal/i));
    fireEvent.click(screen.getByRole("button", { name: /Update Sharing/i }));
    fireEvent.click(screen.getByRole("button", { name: /Apply/i }));
    fireEvent.click(screen.getByRole("button", { name: /Reject/i }));
    fireEvent.click(screen.getByRole("button", { name: /Revert to this version/i }));

    expect(onRequestAi).toHaveBeenNthCalledWith(1, "rewrite");
    expect(onRequestAi).toHaveBeenNthCalledWith(2, "proofread");
    expect(onRequestAi).toHaveBeenNthCalledWith(3, "complete");
    expect(onRequestAi).toHaveBeenNthCalledWith(4, "translate");
    expect(onAiTargetLanguageChange).toHaveBeenCalledWith("French");
    expect(onExportFormatChange).toHaveBeenCalledWith("markdown");
    expect(onIncludeAiAppendixChange).toHaveBeenCalledWith(false);
    expect(onExportDocument).toHaveBeenCalledOnce();
    expect(onShareTargetUserIdChange).toHaveBeenCalledWith("user-mona");
    expect(onShareRoleChange).toHaveBeenCalledWith("editor");
    expect(onShareAllowAiChange).toHaveBeenCalledWith(true);
    expect(onShareSubmit).toHaveBeenCalledOnce();
    expect(onApplySuggestion).toHaveBeenCalledWith("ai-1");
    expect(onRejectSuggestion).toHaveBeenCalledWith("ai-1");
    expect(onRevertVersion).toHaveBeenCalledWith(2);
    expect(screen.getByText(/Live openai provider/i)).toBeInTheDocument();
  });

  it("shows restricted states for non-owners and users without AI access", () => {
    renderInspector({
      canExport: false,
      canManageSharing: false,
      canUseAi: false
    });

    expect(screen.getByText(/Only document owners can change permissions in this prototype/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Update Sharing/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export Document/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Rewrite/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Summarize/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Proofread/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Continue Writing/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Translate Selection/i })).toBeDisabled();
    expect(screen.getByText(/Proofread preserves wording and markup/i)).toBeInTheDocument();
  });
});
