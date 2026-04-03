import { useState, type FormEvent } from "react";
import type { DocumentSummary } from "@midterm/shared";

type SidebarProps = {
  documents: DocumentSummary[];
  selectedDocumentId: string | null;
  onSelectDocument: (documentId: string) => void;
  onCreateDocument: (title: string) => Promise<boolean> | boolean;
  currentUserName: string;
};

export function Sidebar({
  documents,
  selectedDocumentId,
  onSelectDocument,
  onCreateDocument,
  currentUserName
}: SidebarProps) {
  const [isCreatingDocument, setIsCreatingDocument] = useState(false);
  const [draftTitle, setDraftTitle] = useState("New collaborative draft");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = draftTitle.trim();
    if (!title || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const created = await onCreateDocument(title);
      if (created) {
        setDraftTitle("New collaborative draft");
        setIsCreatingDocument(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <p className="eyebrow">Workspace</p>
        <h2>{currentUserName}</h2>
        {isCreatingDocument ? (
          <form className="sidebar-create-form" onSubmit={handleCreateSubmit}>
            <label className="field">
              <span>Document Title</span>
              <input
                autoFocus
                onChange={(event) => setDraftTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setDraftTitle("New collaborative draft");
                    setIsCreatingDocument(false);
                  }
                }}
                placeholder="Document title"
                value={draftTitle}
              />
            </label>

            <div className="button-row">
              <button className="primary-button" disabled={isSubmitting || draftTitle.trim().length === 0} type="submit">
                {isSubmitting ? "Creating..." : "Create"}
              </button>
              <button
                className="ghost-button"
                disabled={isSubmitting}
                onClick={() => {
                  setDraftTitle("New collaborative draft");
                  setIsCreatingDocument(false);
                }}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button className="primary-button" onClick={() => setIsCreatingDocument(true)} type="button">
            New Document
          </button>
        )}
      </div>

      <div className="sidebar-list">
        {documents.map((document) => (
          <button
            key={document.id}
            className={`doc-card ${document.id === selectedDocumentId ? "selected" : ""}`}
            onClick={() => onSelectDocument(document.id)}
            type="button"
          >
            <strong>{document.title}</strong>
            <span>{document.excerpt || "Empty document"}</span>
            <small>
              {document.callerRole} • v{document.currentVersion} • {document.activeCollaboratorCount} online
            </small>
          </button>
        ))}
      </div>
    </aside>
  );
}
