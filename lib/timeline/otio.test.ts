import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { convert, inspect } from "@/lib/timeline/otio";

// These run the real OTIO sidecar through uv, which `npm run setup` checks for. The first run
// may take a while as uv builds tools/otio/.venv.
const timeout = 120_000;

let dir: string;
let edl: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "otio-test-"));
  edl = path.join(dir, "cut.edl");
  await writeFile(
    edl,
    [
      "TITLE: one second at 30 fps",
      "FCM: NON-DROP FRAME",
      "",
      "001  AX       V     C        00:00:00:00 00:00:01:00 01:00:00:00 01:00:01:00",
      "* FROM CLIP NAME: a.mov",
      "",
    ].join("\n"),
  );
});

afterAll(() => rm(dir, { recursive: true, force: true }));

test("reading an EDL without a frame rate is refused", { timeout }, async () => {
  await expect(inspect(edl)).rejects.toThrow("is an EDL, which has no frame rate of its own; pass --rate");
});

test("an EDL read at 30 fps keeps 30 fps timing", { timeout }, async () => {
  const summary = await inspect(edl, { rate: 30 });
  expect(summary.rate).toBe(30);
  expect(summary.duration).toBe(1);
  expect(summary.tracks.flatMap((t) => t.items).filter((i) => i.kind === "Clip")).toHaveLength(1);
});

test("converting an EDL to .otio carries the frame rate through", { timeout }, async () => {
  const otio = path.join(dir, "cut.otio");
  await convert({ input: edl, output: otio, rate: 30 });
  const summary = await inspect(otio);
  expect(summary.rate).toBe(30);
  expect(summary.duration).toBe(1);
});
