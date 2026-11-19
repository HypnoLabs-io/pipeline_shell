import "server-only";
import { access } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { run } from "@/lib/exec";

// DaVinci Resolve is driven by the davinci-resolve-mcp server (registered with `claude mcp add`, see
// docs/integrations.md), not by this app. This module only reports whether there is a Resolve for that
// server to talk to. Linux only: it looks for <dir>/bin/resolve and a process named "resolve".

export type ResolveState = "not-installed" | "installed-not-running" | "running";

export const installDir = () => env().RESOLVE_INSTALL_DIR ?? "/opt/resolve";

/** Paths the Resolve scripting API needs on Linux. The MCP server needs the same three as env. */
export function scriptingPaths() {
  const dir = installDir();
  return {
    RESOLVE_SCRIPT_API: path.join(dir, "Developer", "Scripting"),
    RESOLVE_SCRIPT_LIB: path.join(dir, "libs", "Fusion", "fusionscript.so"),
    PYTHONPATH: path.join(dir, "Developer", "Scripting", "Modules"),
  };
}

async function exists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function state(): Promise<ResolveState> {
  if (!(await exists(path.join(installDir(), "bin", "resolve")))) return "not-installed";
  try {
    await run("pgrep", ["-x", "resolve"], { timeoutMs: 5_000 });
    return "running";
  } catch {
    // pgrep exits 1 when nothing matches.
    return "installed-not-running";
  }
}
