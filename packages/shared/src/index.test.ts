import { describe, expect, it } from "vitest";
import {
  exportDocumentRequestSchema,
  selectionToText,
  shareDocumentRequestSchema,
  selectionRangeSchema
} from "./index";

describe("@midterm/shared", () => {
  it("extracts selection text from document content", () => {
    expect(selectionToText("Collaborative editing", { start: 0, end: 13 })).toBe("Collaborative");
  });

  it("validates a well-formed sharing contract", () => {
    const parsed = shareDocumentRequestSchema.parse({
      principalType: "user",
      principalId: "user-omar",
      role: "editor",
      allowAi: true
    });

    expect(parsed.role).toBe("editor");
  });

  it("rejects an invalid selection range", () => {
    expect(() => selectionRangeSchema.parse({ start: 10, end: 4 })).toThrow();
  });

  it("defaults export requests to include the AI appendix", () => {
    const parsed = exportDocumentRequestSchema.parse({
      format: "pdf"
    });

    expect(parsed.includeAiAppendix).toBe(true);
  });
});
