import { expect, test, vi } from "vitest";

const llm = () => import("@/lib/integrations/llm");

test("only providers whose env is set are configured", async () => {
  vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434/v1");
  vi.stubEnv("OPENAI_COMPAT_BASE_URL", "https://openrouter.ai/api/v1");
  vi.stubEnv("OPENAI_COMPAT_NAME", "openrouter");
  const { configuredProviders } = await llm();
  expect(configuredProviders()).toEqual([
    { id: "ollama", kind: "local" },
    { id: "openrouter", kind: "compat" },
  ]);
});

test("with nothing set, no provider is configured", async () => {
  const { configuredProviders } = await llm();
  expect(configuredProviders()).toEqual([]);
});

test("an Ollama tag keeps its colon: the id splits on the first one", async () => {
  vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434/v1");
  const { model } = await llm();
  expect(model({ id: "ollama:qwen3:14b" }).modelId).toBe("qwen3:14b");
});

test("no id falls back to LLM_MODEL for text and VISION_MODEL for images", async () => {
  vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434/v1");
  vi.stubEnv("LLM_MODEL", "ollama:qwen3:14b");
  vi.stubEnv("VISION_MODEL", "ollama:gemma4:26b");
  const { model } = await llm();
  expect(model().modelId).toBe("qwen3:14b");
  expect(model({ purpose: "vision" }).modelId).toBe("gemma4:26b");
});

test("no id and no default is an error that names the variable", async () => {
  const { model } = await llm();
  expect(() => model()).toThrow("no model given and LLM_MODEL is unset");
  expect(() => model({ purpose: "vision" })).toThrow("no model given and VISION_MODEL is unset");
});

test("an id without a provider prefix is rejected", async () => {
  const { model } = await llm();
  expect(() => model({ id: "qwen3" })).toThrow('model id must be "<provider>:<model>", got "qwen3"');
});

test("a provider without its env is rejected before any network call", async () => {
  const { model } = await llm();
  expect(() => model({ id: "anthropic:claude-opus-5-5" })).toThrow(
    'provider "anthropic" is not configured; set its env in .env.local',
  );
});
