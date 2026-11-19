import { expect, test } from "vitest";
import { z } from "zod";
import { run, runJson } from "@/lib/exec";

test("a missing binary says so instead of a bare ENOENT", async () => {
  await expect(run("pipeline-shell-no-such-binary", ["--version"])).rejects.toThrow(
    "pipeline-shell-no-such-binary not found; install it or put it on PATH",
  );
});

test("a failing command reports its exit code and stderr", async () => {
  await expect(run(process.execPath, ["-e", "console.error('bad input'); process.exit(3)"])).rejects.toThrow(
    /failed \(3\): bad input/,
  );
});

test("runJson parses stdout through the schema, keeping only declared fields", async () => {
  const out = await runJson(z.object({ ok: z.boolean() }), process.execPath, [
    "-e",
    "console.log(JSON.stringify({ ok: true, extra: 1 }))",
  ]);
  expect(out).toEqual({ ok: true });
});
