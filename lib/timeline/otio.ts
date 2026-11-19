import "server-only";
import path from "node:path";
import { z } from "zod";
import { runJson } from "@/lib/exec";

// OpenTimelineIO is Python-only, so it runs as a uv sidecar (tools/otio). Native .otio is JSON,
// so Node can write timelines directly; the sidecar handles adapters (EDL, FCP7 XML, FCPXML, AAF).
const PROJECT = path.join(process.cwd(), "tools", "otio");
const CLI = path.join(PROJECT, "otio_cli.py");

function otioCli<S extends z.ZodType>(schema: S, args: string[]) {
  return runJson(schema, "uv", ["run", "--project", PROJECT, "python", CLI, ...args], { timeoutMs: 120_000 });
}

const rangeSchema = z.object({ start: z.number(), duration: z.number(), rate: z.number() }).nullable();

const summarySchema = z.object({
  name: z.string(),
  duration: z.number(),
  rate: z.number(),
  global_start: z.number().nullable(),
  tracks: z.array(
    z.object({
      name: z.string(),
      kind: z.string(),
      items: z.array(
        z.object({
          kind: z.string(),
          name: z.string(),
          range: rangeSchema,
          media: z.string().nullable().optional(),
        }),
      ),
    }),
  ),
});

export type OtioSummary = z.infer<typeof summarySchema>;

export const version = () =>
  otioCli(z.object({ otio: z.string(), adapters: z.array(z.string()) }), ["version"]);

const rateArgs = (rate?: number) => (rate === undefined ? [] : ["--rate", String(rate)]);

/** Summarize any timeline OTIO can read (.otio, .edl, .xml, .fcpxml, .aaf ...). Pass `rate` for an EDL. */
export const inspect = (file: string, { rate }: { rate?: number } = {}) =>
  otioCli(summarySchema, ["inspect", file, ...rateArgs(rate)]);

/** Convert between formats. Adapters are picked from the extensions; pass `rate` when the input is an EDL. */
export const convert = ({ input, output, rate }: { input: string; output: string; rate?: number }) =>
  otioCli(z.object({ input: z.string(), output: z.string() }), ["convert", input, output, ...rateArgs(rate)]);
