import { expect, test, vi } from "vitest";
import { z } from "zod";
import { fetchJson } from "@/lib/http";

const schema = z.object({ version: z.string() });

function refuseConnections() {
  const cause = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:8188"), { code: "ECONNREFUSED" });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed", { cause })));
}

test("an unreachable service names the URL and the reason", async () => {
  refuseConnections();
  await expect(fetchJson(schema, "http://127.0.0.1:8188/system_stats")).rejects.toThrow(
    "could not reach http://127.0.0.1:8188/system_stats: ECONNREFUSED",
  );
});

test("an unreachable service with no error code falls back to the cause's message", async () => {
  // What Node's fetch throws for a port the fetch spec blocks, such as 9.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed", { cause: new Error("bad port") })));
  await expect(fetchJson(schema, "http://127.0.0.1:9/x")).rejects.toThrow("could not reach http://127.0.0.1:9/x: bad port");
});

test("a non-2xx response names the URL, the status and the body", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("model not found", { status: 404 })));
  await expect(fetchJson(schema, "http://host/api")).rejects.toThrow("http://host/api returned 404: model not found");
});

test("a body that isn't JSON names the URL", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>login</html>", { status: 200 })));
  await expect(fetchJson(schema, "http://host/api")).rejects.toThrow("http://host/api returned a body that isn't JSON");
});

test("the body is parsed by the schema, keeping only declared fields", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ version: "1.2.3", extra: true })));
  await expect(fetchJson(schema, "http://host/api")).resolves.toEqual({ version: "1.2.3" });
});

test("a body that doesn't match the schema is rejected", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ version: 3 })));
  await expect(fetchJson(schema, "http://host/api")).rejects.toThrow(z.ZodError);
});
