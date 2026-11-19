import "server-only";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { env } from "@/lib/env";
import { fetchJson } from "@/lib/http";
import sdxlTxt2img from "@/workflows/comfyui/sdxl-txt2img.json";

// Local ComfyUI over its HTTP API: unauthenticated and poll-based (no websocket).
// A plug-in, never load-bearing: every call fails with a clear error when ComfyUI is down,
// and nothing else in the app depends on it.

/** A ComfyUI graph in API format: node id -> { class_type, inputs }. */
const graphSchema = z.record(
  z.string(),
  z.object({ class_type: z.string(), inputs: z.record(z.string(), z.unknown()) }),
);
export type ComfyGraph = z.infer<typeof graphSchema>;

const imageSchema = z.object({ filename: z.string(), subfolder: z.string(), type: z.string() });
export type ComfyImage = z.infer<typeof imageSchema>;

export const isEnabled = () => env().COMFYUI_URL !== undefined;

function url(pathname: string): string {
  const base = env().COMFYUI_URL;
  if (!base) throw new Error("ComfyUI is off: set COMFYUI_URL in .env.local");
  return base.replace(/\/+$/, "") + pathname;
}

const statsSchema = z.object({
  system: z.object({ comfyui_version: z.string() }),
  devices: z.array(z.object({ name: z.string(), vram_total: z.number(), vram_free: z.number() })),
});
const queueSchema = z.object({ queue_running: z.array(z.unknown()), queue_pending: z.array(z.unknown()) });

const gb = (bytes: number) => Math.round((bytes / 1024 ** 3) * 10) / 10;

export async function health() {
  const [stats, queue] = await Promise.all([
    fetchJson(statsSchema, url("/system_stats")),
    fetchJson(queueSchema, url("/queue")),
  ]);
  const gpu = stats.devices[0];
  return {
    version: stats.system.comfyui_version,
    // Raw names look like "cuda:0 <GPU model> : cudaMallocAsync".
    gpu: gpu ? gpu.name.replace(/^\S+:\d+\s+/, "").replace(/\s+:\s+\S+$/, "") : "none",
    vramFreeGb: gpu ? gb(gpu.vram_free) : 0,
    vramTotalGb: gpu ? gb(gpu.vram_total) : 0,
    running: queue.queue_running.length,
    pending: queue.queue_pending.length,
  };
}

// /object_info combos are [choices, options] tuples; we only need the choices.
const checkpointInfoSchema = z.object({
  CheckpointLoaderSimple: z.object({
    input: z.object({ required: z.object({ ckpt_name: z.tuple([z.array(z.string())], z.unknown()) }) }),
  }),
});

/** Checkpoint names installed in ComfyUI. */
export async function checkpoints(): Promise<string[]> {
  const info = await fetchJson(checkpointInfoSchema, url("/object_info/CheckpointLoaderSimple"));
  return info.CheckpointLoaderSimple.input.required.ckpt_name[0];
}

const promptResponseSchema = z.object({
  prompt_id: z.string(),
  node_errors: z.record(z.string(), z.unknown()).optional(),
});

/** Queue a graph. Returns the prompt id. */
export async function queue(graph: ComfyGraph, clientId = "pipeline_shell"): Promise<string> {
  const body = await fetchJson(promptResponseSchema, url("/prompt"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: graph, client_id: clientId }),
    timeoutMs: 30_000,
  });
  if (body.node_errors && Object.keys(body.node_errors).length > 0) {
    throw new Error(`ComfyUI rejected the workflow: ${JSON.stringify(body.node_errors).slice(0, 500)}`);
  }
  return body.prompt_id;
}

const historySchema = z.record(
  z.string(),
  z.object({
    status: z
      .object({ status_str: z.string().optional(), completed: z.boolean().optional(), messages: z.unknown() })
      .optional(),
    outputs: z.record(z.string(), z.object({ images: z.array(imageSchema).optional() })).optional(),
  }),
);

/** Poll /history until the prompt finishes. Returns the saved output images. */
export async function wait(promptId: string, timeoutMs = 180_000): Promise<ComfyImage[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const history = await fetchJson(historySchema, url(`/history/${encodeURIComponent(promptId)}`));
    const entry = history[promptId];
    if (entry?.status?.status_str === "error") {
      throw new Error(`ComfyUI run failed: ${JSON.stringify(entry.status.messages).slice(0, 500)}`);
    }
    if (entry && (entry.status?.completed || entry.outputs)) {
      return Object.values(entry.outputs ?? {})
        .flatMap((o) => o.images ?? [])
        .filter((img) => img.type === "output");
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`timed out after ${timeoutMs / 1000}s waiting for ComfyUI prompt ${promptId}`);
}

/** Download one output image. */
export async function fetchImage(img: ComfyImage): Promise<Buffer> {
  const params = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type });
  const res = await fetch(url(`/view?${params}`), { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`ComfyUI /view returned ${res.status} for ${img.filename}`);
  return Buffer.from(await res.arrayBuffer());
}

function setInputs(graph: ComfyGraph, nodeId: string, inputs: Record<string, unknown>) {
  const node = graph[nodeId];
  if (!node) throw new Error(`workflow has no node "${nodeId}"`);
  Object.assign(node.inputs, inputs);
}

export type Txt2ImgOptions = {
  prompt: string;
  negative?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
  checkpoint?: string;
  timeoutMs?: number;
};

/** SDXL text-to-image with workflows/comfyui/sdxl-txt2img.json. Returns PNG buffers. */
export async function txt2img(o: Txt2ImgOptions) {
  const available = await checkpoints();
  const checkpoint = o.checkpoint ?? available[0];
  if (!checkpoint || !available.includes(checkpoint)) {
    throw new Error(`checkpoint ${checkpoint ?? "(none)"} not found; installed: ${available.join(", ") || "none"}`);
  }
  const seed = o.seed ?? randomInt(0, 2 ** 47);
  const graph = graphSchema.parse(structuredClone(sdxlTxt2img));
  setInputs(graph, "4", { ckpt_name: checkpoint });
  setInputs(graph, "5", { width: o.width ?? 1024, height: o.height ?? 1024 });
  setInputs(graph, "6", { text: o.prompt });
  setInputs(graph, "7", { text: o.negative ?? "" });
  setInputs(graph, "3", { seed, steps: o.steps ?? 25, cfg: o.cfg ?? 7 });

  const promptId = await queue(graph);
  const images = await wait(promptId, o.timeoutMs);
  const files = await Promise.all(images.map(async (img) => ({ ...img, data: await fetchImage(img) })));
  return { promptId, seed, checkpoint, files };
}
