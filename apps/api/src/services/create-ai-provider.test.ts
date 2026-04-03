import { afterEach, describe, expect, it } from "vitest";
import { createAiProvider } from "./create-ai-provider.js";

const originalEnv = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_FAST_MODEL: process.env.OPENAI_FAST_MODEL,
  OPENAI_QUALITY_MODEL: process.env.OPENAI_QUALITY_MODEL
};

describe("createAiProvider", () => {
  afterEach(() => {
    process.env.AI_PROVIDER = originalEnv.AI_PROVIDER;
    process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;
    process.env.OPENAI_BASE_URL = originalEnv.OPENAI_BASE_URL;
    process.env.OPENAI_FAST_MODEL = originalEnv.OPENAI_FAST_MODEL;
    process.env.OPENAI_QUALITY_MODEL = originalEnv.OPENAI_QUALITY_MODEL;
  });

  it("falls back to the mock provider when running in auto mode without an API key", () => {
    delete process.env.OPENAI_API_KEY;
    process.env.AI_PROVIDER = "auto";

    const provider = createAiProvider();
    expect(provider.getStatus().mode).toBe("mock");
  });

  it("fails fast when openai mode is requested without credentials", () => {
    delete process.env.OPENAI_API_KEY;
    process.env.AI_PROVIDER = "openai";

    expect(() => createAiProvider()).toThrow("OPENAI_API_KEY is missing");
  });
});
