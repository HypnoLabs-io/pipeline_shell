import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createProviderRegistry, generateText } from "ai";
import { z } from "zod";
import { env } from "@/lib/env";
import { fetchJson } from "@/lib/http";

// Off-the-shelf LLMs through one Vercel AI SDK registry. A provider is registered only when its
// env is set, so an unconfigured provider is "off", not an error.
//
// Model ids are "<provider>:<model>". The registry splits on the FIRST colon, so Ollama tags keep
// theirs: "ollama:qwen3:14b" is provider "ollama", model "qwen3:14b".
//
// Don't pass temperature/topP/topK for Anthropic models: current Claude models reject sampling params.

export const DEFAULT_ANTHROPIC_MODEL = "anthropic:claude-opus-5-5";

export type ProviderKind = "local" | "hosted" | "compat";
export type ConfiguredProvider = { id: string; kind: ProviderKind };

export function configuredProviders(): ConfiguredProvider[] {
  const e = env();
  const out: ConfiguredProvider[] = [];
  if (e.OLLAMA_BASE_URL) out.push({ id: "ollama", kind: "local" });
  if (e.ANTHROPIC_API_KEY) out.push({ id: "anthropic", kind: "hosted" });
  if (e.OPENAI_API_KEY) out.push({ id: "openai", kind: "hosted" });
  if (e.OPENAI_COMPAT_BASE_URL) out.push({ id: e.OPENAI_COMPAT_NAME ?? "compat", kind: "compat" });
  return out;
}

type Providers = Parameters<typeof createProviderRegistry>[0];

function buildProviders(): Providers {
  const e = env();
  const providers: Providers = {};
  if (e.OLLAMA_BASE_URL) {
    providers.ollama = createOpenAICompatible({ name: "ollama", baseURL: e.OLLAMA_BASE_URL });
  }
  if (e.ANTHROPIC_API_KEY) providers.anthropic = createAnthropic({ apiKey: e.ANTHROPIC_API_KEY });
  if (e.OPENAI_API_KEY) providers.openai = createOpenAI({ apiKey: e.OPENAI_API_KEY });
  if (e.OPENAI_COMPAT_BASE_URL) {
    const name = e.OPENAI_COMPAT_NAME ?? "compat";
    providers[name] = createOpenAICompatible({
      name,
      baseURL: e.OPENAI_COMPAT_BASE_URL,
      apiKey: e.OPENAI_COMPAT_API_KEY,
    });
  }
  return providers;
}

let registry: ReturnType<typeof createProviderRegistry> | undefined;

export function llmRegistry() {
  registry ??= createProviderRegistry(buildProviders());
  return registry;
}

export type ModelId = `${string}:${string}`;

function isModelId(id: string): id is ModelId {
  const i = id.indexOf(":");
  return i > 0 && i < id.length - 1;
}

/** Resolve a model id, falling back to LLM_MODEL (text) or VISION_MODEL (images). */
export function model({ id, purpose = "text" }: { id?: string; purpose?: "text" | "vision" } = {}) {
  const e = env();
  const fallbackVar = purpose === "vision" ? "VISION_MODEL" : "LLM_MODEL";
  const resolved = id ?? e[fallbackVar];
  if (!resolved) throw new Error(`no model given and ${fallbackVar} is unset`);
  if (!isModelId(resolved)) throw new Error(`model id must be "<provider>:<model>", got "${resolved}"`);
  const provider = resolved.slice(0, resolved.indexOf(":"));
  if (!configuredProviders().some((p) => p.id === provider)) {
    throw new Error(`provider "${provider}" is not configured; set its env in .env.local`);
  }
  return llmRegistry().languageModel(resolved);
}

/** One-shot text generation. */
export async function complete({ prompt, model: id, system }: { prompt: string; model?: string; system?: string }) {
  const { text } = await generateText({ model: model({ id }), system, prompt });
  return text;
}

const tagsSchema = z.object({ models: z.array(z.object({ name: z.string() })) });

/** Installed Ollama models, from its native /api/tags (the /v1 base minus /v1). */
export async function ollamaModels(): Promise<string[]> {
  const base = env().OLLAMA_BASE_URL;
  if (!base) throw new Error("Ollama is off: set OLLAMA_BASE_URL in .env.local");
  const root = base.replace(/\/+$/, "").replace(/\/v1$/, "");
  const body = await fetchJson(tagsSchema, `${root}/api/tags`, { timeoutMs: 5_000 });
  return body.models.map((m) => m.name);
}
