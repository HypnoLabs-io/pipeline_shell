import "server-only";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { env } from "@/lib/env";
import { run, runJson } from "@/lib/exec";

const ffmpegBin = () => env().FFMPEG_PATH ?? "ffmpeg";
const ffprobeBin = () => env().FFPROBE_PATH ?? "ffprobe";

/** Raw ffmpeg call. Arguments go through execFile, so nothing is shell-interpreted. */
export function ffmpeg(args: string[], timeoutMs = 600_000) {
  return run(ffmpegBin(), ["-hide_banner", "-nostdin", ...args], { timeoutMs });
}

/** First line of `ffmpeg -version`, e.g. "ffmpeg version 6.1.1-3ubuntu5". */
export async function version(): Promise<string> {
  const { stdout } = await run(ffmpegBin(), ["-version"], { timeoutMs: 10_000 });
  return (stdout.split("\n")[0] ?? "").replace(/\s+Copyright.*$/, "").trim();
}

// Only the fields we read; ffprobe emits many more and z.object strips them.
const probeSchema = z.object({
  format: z.object({
    filename: z.string(),
    format_name: z.string(),
    duration: z.coerce.number().optional(),
    bit_rate: z.coerce.number().optional(),
  }),
  streams: z.array(
    z.object({
      index: z.number(),
      codec_type: z.string(),
      codec_name: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      r_frame_rate: z.string().optional(),
      duration: z.coerce.number().optional(),
    }),
  ),
});

export type Probe = z.infer<typeof probeSchema>;

/** ffprobe a file. */
export function probe(file: string): Promise<Probe> {
  return runJson(
    probeSchema,
    ffprobeBin(),
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file],
    { timeoutMs: 30_000 },
  );
}

/** Duration in seconds from the container, falling back to the first video stream. */
export async function durationSeconds(file: string): Promise<number> {
  const p = await probe(file);
  const seconds = p.format.duration ?? p.streams.find((s) => s.codec_type === "video")?.duration;
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`could not read a duration from ${file}`);
  }
  return seconds;
}

export type Frame = { time: number; data: Buffer; mediaType: "image/jpeg" };

/**
 * Evenly spaced JPEG stills, one from the middle of each of `count` equal slices of the video.
 * This is how a video reaches an image-only vision model.
 */
export async function sampleFrames({
  file,
  count = 8,
  width = 768,
}: {
  file: string;
  count?: number;
  width?: number;
}): Promise<Frame[]> {
  const duration = await durationSeconds(file);
  const dir = await mkdtemp(path.join(tmpdir(), "pipeline-frames-"));
  try {
    const frames: Frame[] = [];
    for (let i = 0; i < count; i++) {
      const time = (duration * (i + 0.5)) / count;
      const out = path.join(dir, `frame-${i}.jpg`);
      await ffmpeg(
        ["-ss", time.toFixed(3), "-i", file, "-frames:v", "1", "-vf", `scale=${width}:-2`, "-q:v", "3", "-y", out],
        60_000,
      );
      frames.push({ time, data: await readFile(out), mediaType: "image/jpeg" });
    }
    return frames;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
