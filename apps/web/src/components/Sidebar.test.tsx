import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DocumentSummary } from "@midterm/shared";
import { Sidebar } from "./Sidebar";

const documents: DocumentSummary[] = [
  {
    id: "doc-1",
    title: "Launch Plan Draft",
    excerpt: "Executive summary work in progress",
    updatedAt: "2026-04-03T10:00:00.000Z",
    ownerId: "user-layla",
    currentVersion: 3,
    activeCollaboratorCount: 2,
    callerRole: "owner",
    pendingAiSuggestions: 1
  },
  {
    id: "doc-2",
    title: "Architecture Notes",
    excerpt: "Realtime sync considerations",
    updatedAt: "2026-04-03T09:00:00.000Z",
    ownerId: "user-layla",
    currentVersion: 1,
    activeCollaboratorCount: 0,
    callerRole: "editor",
    pendingAiSuggestions: 0
  }
];

describe("Sidebar", () => {
  it("renders documents, highlights the active draft, and forwards selection events", () => {
    const onSelectDocument = vi.fn();

    render(
      <Sidebar
        currentUserName="Layla Hassan"
        documents={documents}
        selectedDocumentId="doc-2"
        onCreateDocument={vi.fn()}
        onSelectDocument={onSelectDocument}
      />
    );

    const selectedDocument = screen.getByRole("button", { name: /Architecture Notes/i });
    fireEvent.click(selectedDocument);

    expect(selectedDocument.className).toContain("selected");
    expect(onSelectDocument).toHaveBeenCalledWith("doc-2");
  });

  it("opens an inline create form and submits the requested title", async () => {
    const onCreateDocument = vi.fn().mockResolvedValue(true);

    render(
      <Sidebar
        currentUserName="Layla Hassan"
        documents={documents}
        selectedDocumentId="doc-1"
        onCreateDocument={onCreateDocument}
        onSelectDocument={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /New Document/i }));
    fireEvent.change(screen.getByLabelText(/Document Title/i), { target: { value: "Design Review Draft" } });
    fireEvent.click(screen.getByRole("button", { name: /Create/i }));

    expect(onCreateDocument).toHaveBeenCalledWith("Design Review Draft");
    expect(await screen.findByRole("button", { name: /New Document/i })).toBeInTheDocument();
  });

  it("lets the user cancel the inline create flow without submitting", () => {
    const onCreateDocument = vi.fn();

    render(
      <Sidebar
        currentUserName="Layla Hassan"
        documents={documents}
        selectedDocumentId="doc-1"
        onCreateDocument={onCreateDocument}
        onSelectDocument={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /New Document/i }));
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));

    expect(onCreateDocument).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /New Document/i })).toBeInTheDocument();
  });
});
