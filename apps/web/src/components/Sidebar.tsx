import type { DocumentSummary } from "@midterm/shared";

type SidebarProps = {
  documents: DocumentSummary[];
  selectedDocumentId: string | null;
  onSelectDocument: (documentId: string) => void;
  onCreateDocument: () => void;
  currentUserName: string;
};

export function Sidebar({
  documents,
  selectedDocumentId,
  onSelectDocument,
  onCreateDocument,
  currentUserName
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <p className="eyebrow">Workspace</p>
        <h2>{currentUserName}</h2>
        <button className="primary-button" onClick={onCreateDocument} type="button">
          New Document
        </button>
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
