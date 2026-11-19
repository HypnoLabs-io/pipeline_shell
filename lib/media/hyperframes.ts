import "server-only";
import path from "node:path";
import { z } from "zod";
import { run, runJson, type RunOptions } from "@/lib/exec";

/** The repo's HyperFrames composition project. */
export const VIDEO_DIR = path.join(process.cwd(), "video");

// The project-local CLI from devDependencies (pinned), not whatever npx would fetch.
const BIN = path.join(process.cwd(), "node_modules", ".bin", "hyperframes");
const OPTS: RunOptions = { env: { HYPERFRAMES_SKIP_SKILLS: "1" } };

const doctorSchema = z.object({
  ok: z.boolean(),
  checks: z.array(z.object({ name: z.string(), ok: z.boolean(), detail: z.string().optional() })),
});

/**
 * `hyperframes doctor --json`. The CLI's own `ok` is false whenever an optional extra is missing
 * (whisper-cpp, for example), so `ok` here ignores the checks it labels optional.
 */
export async function doctor() {
  const report = await runJson(doctorSchema, BIN, ["doctor", "--json"], { ...OPTS, timeoutMs: 60_000 });
  const failing = report.checks.filter((c) => !c.ok);
  const isOptional = (c: (typeof failing)[number]) => /optional/i.test(c.detail ?? "");
  const required = failing.filter((c) => !isOptional(c));
  return {
    ok: required.length === 0,
    version: report.checks.find((c) => c.name === "Version")?.detail ?? "unknown",
    failing: required.map((c) => c.name),
    optionalMissing: failing.filter(isOptional).map((c) => c.name),
  };
}

/** `hyperframes check --json` on a project dir (lint, runtime, layout, contrast). */
export function check(dir = VIDEO_DIR) {
  return runJson(z.unknown(), BIN, ["check", dir, "--json"], { ...OPTS, timeoutMs: 300_000 });
}

export type RenderQuality = "draft" | "looks" | "delivery";

/** Render a composition project to a file. Returns the output path. */
export async function render({
  output,
  dir = VIDEO_DIR,
  quality = "looks",
}: {
  output: string;
  dir?: string;
  quality?: RenderQuality;
}) {
  await run(BIN, ["render", dir, "--quality", quality, "--output", output], { ...OPTS, timeoutMs: 900_000 });
  return output;
}
