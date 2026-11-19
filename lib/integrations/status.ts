import "server-only";
import { env } from "@/lib/env";
import * as comfyui from "@/lib/integrations/comfyui";
import { configuredProviders, ollamaModels } from "@/lib/integrations/llm";
import * as resolve from "@/lib/integrations/resolve";
import type { IntegrationStatus } from "@/lib/integrations/types";
import * as ffmpeg from "@/lib/media/ffmpeg";
import * as hyperframes from "@/lib/media/hyperframes";
import * as otio from "@/lib/timeline/otio";

/**
 * One status row's source. `enabledBy` says how it turns on: from `.env.local` ("env") or from a tool
 * installed on the machine ("install"). An "env" check must return "off" without touching the network
 * when its variables are unset. `probe` may throw when the integration is broken.
 */
export type Check = {
  id: string;
  name: string;
  enabledBy: "env" | "install";
  probe: () => Promise<Omit<IntegrationStatus, "id" | "name">>;
};

const off = (detail: string) => ({ state: "off" as const, detail });
const ok = (detail: string) => ({ state: "ok" as const, detail });
const error = (detail: string) => ({ state: "error" as const, detail });

/** Every integration on the status page, in display order. A new integration adds its row here. */
export const checks: Check[] = [
  { id: "ffmpeg", name: "FFmpeg", enabledBy: "install", probe: async () => ok(await ffmpeg.version()) },
  {
    id: "hyperframes",
    name: "HyperFrames",
    enabledBy: "install",
    probe: async () => {
      const d = await hyperframes.doctor();
      if (!d.ok) return error(`doctor failing: ${d.failing.join(", ")}`);
      const extra = d.optionalMissing.length ? ` · optional missing: ${d.optionalMissing.join(", ")}` : "";
      return ok(`v${d.version}${extra}`);
    },
  },
  {
    id: "otio",
    name: "OpenTimelineIO",
    enabledBy: "install",
    probe: async () => {
      const v = await otio.version();
      return ok(`v${v.otio} · ${v.adapters.length} adapters`);
    },
  },
  {
    id: "comfyui",
    name: "ComfyUI",
    enabledBy: "env",
    probe: async () => {
      if (!comfyui.isEnabled()) return off("COMFYUI_URL not set");
      const h = await comfyui.health();
      return ok(`v${h.version} · ${h.gpu} · ${h.vramFreeGb}/${h.vramTotalGb} GB free · queue ${h.running + h.pending}`);
    },
  },
  {
    id: "ollama",
    name: "Ollama",
    enabledBy: "env",
    probe: async () => {
      if (!env().OLLAMA_BASE_URL) return off("OLLAMA_BASE_URL not set");
      const models = await ollamaModels();
      return ok(`${models.length} models · LLM ${env().LLM_MODEL ?? "unset"} · vision ${env().VISION_MODEL ?? "unset"}`);
    },
  },
  ...(["anthropic", "openai"] as const).map(
    (id): Check => ({
      id,
      name: id === "anthropic" ? "Anthropic" : "OpenAI",
      enabledBy: "env",
      // Hosted providers are only checked for a key: a live call would cost money.
      probe: async () =>
        configuredProviders().some((p) => p.id === id) ? ok("API key set") : off("API key not set"),
    }),
  ),
  {
    id: "compat",
    name: "OpenAI-compatible",
    enabledBy: "env",
    probe: async () => {
      const p = configuredProviders().find((c) => c.kind === "compat");
      return p ? ok(`"${p.id}" at ${env().OPENAI_COMPAT_BASE_URL}`) : off("OPENAI_COMPAT_BASE_URL not set");
    },
  },
  {
    id: "resolve",
    name: "DaVinci Resolve (MCP)",
    enabledBy: "install",
    probe: async () => {
      const s = await resolve.state();
      switch (s) {
        case "not-installed":
          return off(`not installed at ${resolve.installDir()}`);
        case "installed-not-running":
          return off("installed, not running");
        case "running":
          return ok("running");
        default: {
          const _exhaustive: never = s;
          return _exhaustive;
        }
      }
    },
  },
];

/** Probe every integration in `checks`. Never throws. */
export function integrationStatus(): Promise<IntegrationStatus[]> {
  return runChecks(checks);
}

/** Run probes in parallel, keeping their order. A probe that throws becomes an "error" row. */
export function runChecks(list: Check[]): Promise<IntegrationStatus[]> {
  return Promise.all(
    list.map(async ({ id, name, probe }) => {
      try {
        return { id, name, ...(await probe()) };
      } catch (e) {
        return { id, name, ...error(e instanceof Error ? e.message : String(e)) };
      }
    }),
  );
}
