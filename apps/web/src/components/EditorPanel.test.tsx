import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Document, PresenceParticipant } from "@midterm/shared";
import { EditorPanel } from "./EditorPanel";

const document: Document = {
  id: "doc-1",
  title: "Launch Plan Draft",
  content: "Collaborative editing makes project reviews faster.",
  createdAt: "2026-04-03T10:00:00.000Z",
  updatedAt: "2026-04-03T10:00:00.000Z",
  ownerId: "user-layla",
  currentVersion: 2,
  activeCollaboratorCount: 1,
  permissions: [],
  versions: [],
  aiInteractions: []
};

const participants: PresenceParticipant[] = [
  {
    userId: "user-omar",
    displayName: "Omar Nabil",
    color: "#1e88e5",
    cursor: 12,
    connectedAt: "2026-04-03T10:00:00.000Z"
  }
];

describe("EditorPanel", () => {
  it("renders an empty state when no document is selected", () => {
    render(
      <EditorPanel
        canEdit={false}
        document={null}
        onChange={vi.fn()}
        onSelectionChange={vi.fn()}
        participants={[]}
        selectionLabel="Select text"
        socketConnected={false}
        textareaRef={createRef<HTMLTextAreaElement>()}
      />
    );

    expect(screen.getByText("Select a document")).toBeInTheDocument();
  });

  it("forwards content and selection changes for editable documents", () => {
    const onChange = vi.fn();
    const onSelectionChange = vi.fn();

    render(
      <EditorPanel
        canEdit
        document={document}
        onChange={onChange}
        onSelectionChange={onSelectionChange}
        participants={participants}
        selectionLabel="Selection preview"
        socketConnected
        textareaRef={createRef<HTMLTextAreaElement>()}
      />
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Updated content" } });
    textarea.setSelectionRange(2, 10);
    fireEvent.select(textarea);

    expect(onChange).toHaveBeenCalledWith("Updated content");
    expect(onSelectionChange).toHaveBeenCalledWith(2, 10);
    expect(screen.getByText(/Omar Nabil @ 12/i)).toBeInTheDocument();
  });

  it("shows the read-only hint when the caller cannot edit", () => {
    render(
      <EditorPanel
        canEdit={false}
        document={document}
        onChange={vi.fn()}
        onSelectionChange={vi.fn()}
        participants={[]}
        selectionLabel="Selection preview"
        socketConnected={false}
        textareaRef={createRef<HTMLTextAreaElement>()}
      />
    );

    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByText(/This role is read-only/i)).toBeInTheDocument();
  });
});
