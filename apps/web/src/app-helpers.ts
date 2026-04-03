import type { AiInteraction, AiFeature, DocumentPermission, DocumentRole, SelectionRange } from "@midterm/shared";

export function roleCanEdit(role?: DocumentRole) {
  return role === "owner" || role === "editor";
}

export function roleCanManage(role?: DocumentRole) {
  return role === "owner";
}

export function roleCanUseAi(permission?: DocumentPermission) {
  return Boolean(permission?.allowAi);
}

export function previewSelection(content: string, selection: SelectionRange) {
  if (selection.start === selection.end) {
    return `Cursor at ${selection.start}. Use Continue Writing for inline completion, or select text for rewrite and proofread.`;
  }

  const text = content.slice(selection.start, selection.end).replace(/\s+/g, " ").trim();
  const preview = `${text.slice(0, 100)}${text.length > 100 ? "..." : ""}`;
  return `Selected ${selection.end - selection.start} chars: "${preview}"`;
}

export function formatAiRequestSubmitted(feature: AiFeature) {
  return feature === "complete"
    ? "AI continuation request submitted."
    : `AI ${feature} request submitted.`;
}

export function formatAiCompletionStatus(interaction: Pick<AiInteraction, "feature" | "status">) {
  switch (interaction.status) {
    case "completed":
      return `AI ${interaction.feature} suggestion is ready.`;
    case "failed":
      return `AI ${interaction.feature} request failed.`;
    default:
      return `AI ${interaction.feature} status updated to ${interaction.status}.`;
  }
}
