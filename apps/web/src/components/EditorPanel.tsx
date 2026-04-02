import type { RefObject } from "react";
import type { Document, PresenceParticipant } from "@midterm/shared";

type EditorPanelProps = {
  document: Document | null;
  participants: PresenceParticipant[];
  selectionLabel: string;
  canEdit: boolean;
  socketConnected: boolean;
  onChange: (content: string) => void;
  onSelectionChange: (start: number, end: number) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

export function EditorPanel({
  document,
  participants,
  selectionLabel,
  canEdit,
  socketConnected,
  onChange,
  onSelectionChange,
  textareaRef
}: EditorPanelProps) {
  if (!document) {
    return (
      <section className="editor-panel empty-panel">
        <h2>Select a document</h2>
        <p>Choose a draft from the sidebar or create a new one to start editing.</p>
      </section>
    );
  }

  return (
    <section className="editor-panel">
      <header className="editor-header">
        <div>
          <p className="eyebrow">Document</p>
          <h2>{document.title}</h2>
          <small>v{document.currentVersion} • {socketConnected ? "live sync online" : "reconnecting live sync"}</small>
        </div>

        <div className="presence-row">
          {participants.map((participant) => (
            <span key={participant.userId} className="presence-pill">
              <span className="presence-dot" style={{ backgroundColor: participant.color }} />
              {participant.displayName}
              {participant.cursor !== null ? ` @ ${participant.cursor}` : ""}
            </span>
          ))}
        </div>
      </header>

      <div className="selection-banner">{selectionLabel}</div>

      <textarea
        ref={textareaRef}
        className="editor-textarea"
        value={document.content}
        disabled={!canEdit}
        onChange={(event) => onChange(event.target.value)}
        onSelect={(event) => {
          const target = event.currentTarget;
          onSelectionChange(target.selectionStart ?? 0, target.selectionEnd ?? 0);
        }}
        onKeyUp={(event) => {
          const target = event.currentTarget;
          onSelectionChange(target.selectionStart ?? 0, target.selectionEnd ?? 0);
        }}
        onClick={(event) => {
          const target = event.currentTarget;
          onSelectionChange(target.selectionStart ?? 0, target.selectionEnd ?? 0);
        }}
        spellCheck={false}
      />
      {!canEdit && (
        <p className="muted-note">
          This role is read-only. Owners and editors can change document content; commenters and viewers stay non-destructive.
        </p>
      )}
    </section>
  );
}
