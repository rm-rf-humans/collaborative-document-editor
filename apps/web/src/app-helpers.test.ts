import { describe, expect, it } from "vitest";
import type { DocumentPermission } from "@midterm/shared";
import { formatAiCompletionStatus, formatAiRequestSubmitted, previewSelection, roleCanEdit, roleCanManage, roleCanUseAi } from "./app-helpers";

const permission: DocumentPermission = {
  id: "perm-1",
  documentId: "doc-1",
  principalType: "user",
  principalId: "user-1",
  role: "editor",
  allowAi: true,
  createdAt: "2026-04-03T10:00:00.000Z"
};

describe("app helpers", () => {
  it("maps role and permission capabilities correctly", () => {
    expect(roleCanEdit("owner")).toBe(true);
    expect(roleCanEdit("editor")).toBe(true);
    expect(roleCanEdit("commenter")).toBe(false);
    expect(roleCanManage("owner")).toBe(true);
    expect(roleCanManage("editor")).toBe(false);
    expect(roleCanUseAi(permission)).toBe(true);
    expect(roleCanUseAi({ ...permission, allowAi: false })).toBe(false);
  });

  it("returns an instructional label when nothing is selected", () => {
    expect(previewSelection("Launch plan", { start: 3, end: 3 }))
      .toBe("Cursor at 3. Use Continue Writing for inline completion, or select text for rewrite and proofread.");
  });

  it("builds a clipped preview for non-empty selections", () => {
    const content = "Alpha beta gamma delta epsilon ".repeat(6);
    const label = previewSelection(content, { start: 0, end: content.length });

    expect(label).toMatch(/^Selected \d+ chars:/);
    expect(label).toContain("Alpha beta gamma");
    expect(label).toContain("...");
  });

  it("formats AI request and completion messages consistently", () => {
    expect(formatAiRequestSubmitted("complete")).toBe("AI continuation request submitted.");
    expect(formatAiRequestSubmitted("rewrite")).toBe("AI rewrite request submitted.");
    expect(formatAiCompletionStatus({ feature: "rewrite", status: "completed" })).toBe("AI rewrite suggestion is ready.");
    expect(formatAiCompletionStatus({ feature: "rewrite", status: "failed" })).toBe("AI rewrite request failed.");
  });
});
