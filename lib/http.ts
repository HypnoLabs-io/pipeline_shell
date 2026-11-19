import "server-only";
import type { z } from "zod";

/** fetch + status check + schema validation. The schema is the boundary for the response body. */
export async function fetchJson<S extends z.ZodType>(
  schema: S,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<z.output<S>> {
  const { timeoutMs = 10_000, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    // Node's fetch rejects with a bare "fetch failed"; the reason (ECONNREFUSED, ENOTFOUND) is on `cause`.
    throw new Error(`could not reach ${url}: ${unreachableReason(e)}`, { cause: e });
  }
  if (!res.ok) {
    throw new Error(`${url} returned ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  const body: unknown = await res.json().catch((e: unknown) => {
    throw new Error(`${url} returned a body that isn't JSON`, { cause: e });
  });
  return schema.parse(body);
}

function unreachableReason(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  if (e.name === "TimeoutError") return "timed out";
  const cause = e.cause;
  if (!(cause instanceof Error)) return e.message;
  return "code" in cause && typeof cause.code === "string" ? cause.code : cause.message;
}
