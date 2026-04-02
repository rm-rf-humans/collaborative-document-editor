import type { AiInteraction, DocumentPermission, DocumentVersion, User } from "@midterm/shared";

type InspectorPanelProps = {
  availableUsers: User[];
  permissions: DocumentPermission[];
  versions: DocumentVersion[];
  aiInteractions: AiInteraction[];
  shareTargetUserId: string;
  shareRole: DocumentPermission["role"];
  shareAllowAi: boolean;
  aiTargetLanguage: string;
  canManageSharing: boolean;
  canUseAi: boolean;
  onShareTargetUserIdChange: (value: string) => void;
  onShareRoleChange: (value: DocumentPermission["role"]) => void;
  onShareAllowAiChange: (value: boolean) => void;
  onShareSubmit: () => void;
  onAiTargetLanguageChange: (value: string) => void;
  onRequestAi: (feature: "rewrite" | "summarize" | "translate" | "restructure") => void;
  onApplySuggestion: (interactionId: string) => void;
  onRejectSuggestion: (interactionId: string) => void;
  onRevertVersion: (versionNumber: number) => void;
};

export function InspectorPanel({
  availableUsers,
  permissions,
  versions,
  aiInteractions,
  shareTargetUserId,
  shareRole,
  shareAllowAi,
  aiTargetLanguage,
  canManageSharing,
  canUseAi,
  onShareTargetUserIdChange,
  onShareRoleChange,
  onShareAllowAiChange,
  onShareSubmit,
  onAiTargetLanguageChange,
  onRequestAi,
  onApplySuggestion,
  onRejectSuggestion,
  onRevertVersion
}: InspectorPanelProps) {
  return (
    <aside className="inspector">
      <section className="inspector-card">
        <p className="eyebrow">AI Assistant</p>
        <div className="button-row">
          <button className="secondary-button" disabled={!canUseAi} onClick={() => onRequestAi("rewrite")} type="button">Rewrite</button>
          <button className="secondary-button" disabled={!canUseAi} onClick={() => onRequestAi("summarize")} type="button">Summarize</button>
          <button className="secondary-button" disabled={!canUseAi} onClick={() => onRequestAi("restructure")} type="button">Restructure</button>
        </div>
        <label className="field">
          <span>Translate Target</span>
          <input value={aiTargetLanguage} onChange={(event) => onAiTargetLanguageChange(event.target.value)} />
        </label>
        <button className="secondary-button full-width" disabled={!canUseAi} onClick={() => onRequestAi("translate")} type="button">
          Translate Selection
        </button>

        <div className="stack-list">
          {aiInteractions.length === 0 && <p className="muted-note">No AI suggestions yet.</p>}
          {aiInteractions.map((interaction) => (
            <article key={interaction.id} className="stack-card">
              <strong>{interaction.feature}</strong>
              <small>{interaction.status}</small>
              <p>{interaction.suggestedText || interaction.sourceText}</p>
              {interaction.status === "completed" && (
                <div className="button-row">
                  <button className="secondary-button" onClick={() => onApplySuggestion(interaction.id)} type="button">Apply</button>
                  <button className="ghost-button" onClick={() => onRejectSuggestion(interaction.id)} type="button">Reject</button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="inspector-card">
        <p className="eyebrow">Sharing</p>
        {canManageSharing ? (
          <>
            <label className="field">
              <span>User</span>
              <select value={shareTargetUserId} onChange={(event) => onShareTargetUserIdChange(event.target.value)}>
                {availableUsers.map((user) => (
                  <option key={user.id} value={user.id}>{user.displayName}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Role</span>
              <select value={shareRole} onChange={(event) => onShareRoleChange(event.target.value as DocumentPermission["role"])}>
                <option value="viewer">viewer</option>
                <option value="commenter">commenter</option>
                <option value="editor">editor</option>
                <option value="owner">owner</option>
              </select>
            </label>

            <label className="toggle-row">
              <input checked={shareAllowAi} onChange={(event) => onShareAllowAiChange(event.target.checked)} type="checkbox" />
              <span>Allow AI for this principal</span>
            </label>

            <button className="primary-button full-width" onClick={onShareSubmit} type="button">
              Update Sharing
            </button>
          </>
        ) : (
          <p className="muted-note">Only document owners can change permissions in the PoC.</p>
        )}

        <div className="stack-list compact">
          {permissions.map((permission) => (
            <div key={permission.id} className="stack-card">
              <strong>{permission.principalId}</strong>
              <small>{permission.role} • AI {permission.allowAi ? "enabled" : "disabled"}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="inspector-card">
        <p className="eyebrow">Version History</p>
        <div className="stack-list compact">
          {versions.map((version) => (
            <article key={version.id} className="stack-card">
              <strong>v{version.versionNumber}</strong>
              <small>{new Date(version.createdAt).toLocaleString()}</small>
              <p>{version.reason}</p>
              <button className="ghost-button" onClick={() => onRevertVersion(version.versionNumber)} type="button">
                Revert to this version
              </button>
            </article>
          ))}
        </div>
      </section>
    </aside>
  );
}
