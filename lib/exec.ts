import "server-only";
import { execFile } from "node:child_process";
import type { z } from "zod";

export type ExecResult = { stdout: string; stderr: string };

export class ExecError extends Error {
  constructor(
    readonly command: string,
    readonly code: number | string | null,
    readonly stderr: string,
  ) {
    super(
      code === "ENOENT"
        ? `${command} not found; install it or put it on PATH`
        : `${command} failed (${code ?? "signal"}): ${stderr.trim().slice(0, 500)}`,
    );
  }
}

/** `env` entries are merged over process.env for the child. */
export type RunOptions = { cwd?: string; timeoutMs?: number; env?: Record<string, string> };

/** Run a binary without a shell. Arguments are passed as an array, never interpolated. */
export function run(file: string, args: string[], opts: RunOptions = {}): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        cwd: opts.cwd,
        timeout: opts.timeoutMs ?? 120_000,
        maxBuffer: 64 * 1024 * 1024,
        env: opts.env ? { ...process.env, ...opts.env } : process.env,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new ExecError(file, error.code ?? null, stderr || error.message));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

/** Run a command that prints JSON and validate it. The schema is the boundary for its output. */
export async function runJson<S extends z.ZodType>(
  schema: S,
  file: string,
  args: string[],
  opts: RunOptions = {},
): Promise<z.output<S>> {
  const { stdout } = await run(file, args, opts);
  return schema.parse(JSON.parse(stdout));
}
