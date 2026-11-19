// First-run setup: `npm run setup`. Safe to rerun. It never overwrites .env.local, and it only
// reports what's missing; installing system tools stays your call.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Paths below are relative to the repo root, wherever this is run from.
process.chdir(fileURLToPath(new URL("..", import.meta.url)));

const todo = new Set();
const ok = (msg) => console.log(`  ok    ${msg}`);
const missing = (msg, fix) => {
  console.log(`  todo  ${msg}`);
  todo.add(fix);
};

/** First line of `<bin> <arg>`, or null when the binary isn't on PATH or fails. */
function firstLine(bin, arg) {
  const r = spawnSync(bin, [arg], { encoding: "utf8" });
  return r.status === 0 ? (r.stdout.split("\n")[0] ?? "").trim() : null;
}

console.log("Setting up pipeline_shell\n");

const [major, minor] = process.versions.node.split(".").map(Number);
const nodeOk = major > 22 || (major === 22 && minor >= 12);
if (nodeOk) ok(`node ${process.versions.node}`);
else missing(`node ${process.versions.node} is too old`, "Install Node 22.12 or later (see .nvmrc), then rerun npm run setup.");

if (existsSync(".env.local")) ok(".env.local exists (left as is)");
else {
  copyFileSync(".env.example", ".env.local");
  ok("created .env.local from .env.example; every optional integration starts off");
}

const linuxX64 = process.platform === "linux" && process.arch === "x64";
for (const bin of ["ffmpeg", "ffprobe"]) {
  const version = firstLine(bin, "-version");
  if (version) ok(version.replace(/\s+Copyright.*$/, ""));
  else
    missing(
      `${bin} not found on PATH`,
      linuxX64
        ? "Install ffmpeg: bash tools/install-ffmpeg.sh --link (the build HyperFrames tests against)."
        : "Install ffmpeg and ffprobe from your package manager.",
    );
}

const uv = firstLine("uv", "--version");
if (!uv) missing("uv not found on PATH", "Install uv (https://docs.astral.sh/uv/), then rerun npm run setup.");
else {
  ok(uv);
  const sync = spawnSync("uv", ["sync", "--quiet", "--project", "tools/otio"], { stdio: "inherit" });
  if (sync.status === 0) ok("OpenTimelineIO sidecar synced (tools/otio/.venv)");
  else missing("uv sync failed for tools/otio", "Read the uv output above, fix it, then rerun npm run setup.");
}

console.log(todo.size ? `\nStill to do:\n${[...todo].map((t) => `  - ${t}`).join("\n")}\n` : "\nAll set.\n");
console.log("Next: npm run dev, then open http://localhost:3000. The status page shows each integration.");
console.log("Turn optional ones on in .env.local; docs/integrations.md has the steps.");
process.exitCode = nodeOk ? 0 : 1;
