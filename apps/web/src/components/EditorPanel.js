import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function EditorPanel({ document, participants, selectionLabel, canEdit, socketConnected, onChange, onSelectionChange, textareaRef }) {
    if (!document) {
        return (_jsxs("section", { className: "editor-panel empty-panel", children: [_jsx("h2", { children: "Select a document" }), _jsx("p", { children: "Choose a draft from the sidebar or create a new one to start editing." })] }));
    }
    return (_jsxs("section", { className: "editor-panel", children: [_jsxs("header", { className: "editor-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Document" }), _jsx("h2", { children: document.title }), _jsxs("small", { children: ["v", document.currentVersion, " \u2022 ", socketConnected ? "live sync online" : "reconnecting live sync"] })] }), _jsx("div", { className: "presence-row", children: participants.map((participant) => (_jsxs("span", { className: "presence-pill", children: [_jsx("span", { className: "presence-dot", style: { backgroundColor: participant.color } }), participant.displayName, participant.cursor !== null ? ` @ ${participant.cursor}` : ""] }, participant.userId))) })] }), _jsx("div", { className: "selection-banner", children: selectionLabel }), _jsx("textarea", { ref: textareaRef, className: "editor-textarea", value: document.content, disabled: !canEdit, onChange: (event) => onChange(event.target.value), onSelect: (event) => {
                    const target = event.currentTarget;
                    onSelectionChange(target.selectionStart ?? 0, target.selectionEnd ?? 0);
                }, onKeyUp: (event) => {
                    const target = event.currentTarget;
                    onSelectionChange(target.selectionStart ?? 0, target.selectionEnd ?? 0);
                }, onClick: (event) => {
                    const target = event.currentTarget;
                    onSelectionChange(target.selectionStart ?? 0, target.selectionEnd ?? 0);
                }, spellCheck: false }), !canEdit && (_jsx("p", { className: "muted-note", children: "This role is read-only. Owners and editors can change document content; commenters and viewers stay non-destructive." }))] }));
}
