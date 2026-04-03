import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { AiFeature, AiProviderStatus } from "@midterm/shared";
import { extractContextWindow, selectModelForFeature, type AiProvider, type GenerateSuggestionInput, type GenerateSuggestionResult } from "./ai-provider.js";

const suggestionSchema = z.object({
  suggestedText: z.string().min(1).max(4000)
});

type OpenAiProviderOptions = {
  apiKey: string;
  baseURL?: string;
  fastModel: string;
  qualityModel: string;
};

function buildInstructions(feature: AiFeature, targetLanguage?: string) {
  const commonRules = [
    "You are an enterprise writing assistant for a collaborative editor.",
    "Return only the text that should replace or be inserted into the document.",
    "Do not wrap the answer in JSON, markdown fences, labels, or commentary outside the required field.",
    "Preserve markdown headings, lists, inline code, URLs, and LaTeX commands unless the task explicitly asks for restructuring.",
    "Do not invent citations, bibliography keys, data, or claims that are not supported by the source context."
  ];

  switch (feature) {
    case "rewrite":
      return [
        ...commonRules,
        "Rewrite the selected text to be clearer, tighter, and more professional while preserving meaning and scope."
      ].join("\n");
    case "summarize":
      return [
        ...commonRules,
        "Compress the selected text into a concise replacement summary that captures the essential decisions and facts."
      ].join("\n");
    case "translate":
      return [
        ...commonRules,
        `Translate the selected text into ${targetLanguage ?? "the requested language"} while preserving formatting and terminology.`
      ].join("\n");
    case "restructure":
      return [
        ...commonRules,
        "Restructure the selected text into a clearer technical shape using headings or bullets when they improve readability."
      ].join("\n");
    case "proofread":
      return [
        ...commonRules,
        "Correct grammar, punctuation, casing, and phrasing issues while keeping the original meaning, voice, and formatting stable."
      ].join("\n");
    case "complete":
      return [
        ...commonRules,
        "Generate a natural continuation at the cursor position.",
        "Produce one or two sentences only.",
        "Do not repeat the surrounding text.",
        "Continue the existing tone like Grammarly or Overleaf autocomplete, with no meta explanation."
      ].join("\n");
    default:
      return commonRules.join("\n");
  }
}

function buildUserPrompt(input: GenerateSuggestionInput) {
  const context = extractContextWindow(input.documentContent, input.selection);

  if (input.feature === "complete") {
    return [
      `Document title: ${input.documentTitle}`,
      "",
      "Cursor continuation request.",
      "",
      "Text before cursor:",
      context.before || "(start of document)",
      "",
      "Text after cursor:",
      context.after || "(end of document)"
    ].join("\n");
  }

  return [
    `Document title: ${input.documentTitle}`,
    "",
    "Selected text:",
    context.selected || input.sourceText,
    "",
    "Immediate context before selection:",
    context.before || "(none)",
    "",
    "Immediate context after selection:",
    context.after || "(none)"
  ].join("\n");
}

export class OpenAiSuggestionProvider implements AiProvider {
  private readonly client: OpenAI;
  private readonly status: AiProviderStatus;

  constructor(private readonly options: OpenAiProviderOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL
    });
    this.status = {
      mode: "openai",
      live: true,
      fastModel: options.fastModel,
      qualityModel: options.qualityModel,
      message: `Live OpenAI suggestions are enabled via the Responses API. Fast model: ${options.fastModel}. Quality model: ${options.qualityModel}.`
    };
  }

  getStatus() {
    return this.status;
  }

  getRequestMetadata(feature: AiFeature) {
    return {
      model: selectModelForFeature(feature, this.options.fastModel, this.options.qualityModel),
      promptTemplateVersion: "openai-responses-v1"
    };
  }

  async generateSuggestion(input: GenerateSuggestionInput): Promise<GenerateSuggestionResult> {
    const { model } = this.getRequestMetadata(input.feature);

    const response = await this.client.responses.parse({
      model,
      input: [
        { role: "system", content: buildInstructions(input.feature, input.targetLanguage) },
        { role: "user", content: buildUserPrompt(input) }
      ],
      text: {
        format: zodTextFormat(suggestionSchema, "document_suggestion")
      }
    });

    const parsed = response.output_parsed;
    if (!parsed?.suggestedText?.trim()) {
      throw new Error("The OpenAI provider returned an empty suggestion.");
    }

    return {
      suggestedText: parsed.suggestedText
    };
  }
}
