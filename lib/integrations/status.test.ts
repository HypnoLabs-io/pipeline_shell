import { expect, test, vi } from "vitest";

const status = () => import("@/lib/integrations/status");

test("a probe that throws becomes an error row, and row order is kept", async () => {
  const { runChecks } = await status();
  const rows = await runChecks([
    { id: "a", name: "A", enabledBy: "install", probe: async () => ({ state: "ok", detail: "v1" }) },
    {
      id: "b",
      name: "B",
      enabledBy: "install",
      probe: async () => {
        throw new Error("binary not found");
      },
    },
    { id: "c", name: "C", enabledBy: "env", probe: async () => ({ state: "off", detail: "C_URL not set" }) },
  ]);
  expect(rows).toEqual([
    { id: "a", name: "A", state: "ok", detail: "v1" },
    { id: "b", name: "B", state: "error", detail: "binary not found" },
    { id: "c", name: "C", state: "off", detail: "C_URL not set" },
  ]);
});

test("on a fresh clone with no env, every env-gated integration is off, not an error", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const { checks, runChecks } = await status();
  const envGated = checks.filter((c) => c.enabledBy === "env");
  expect(envGated.length).toBeGreaterThan(0);
  const rows = await runChecks(envGated);
  expect(rows.map((r) => [r.id, r.state])).toEqual(envGated.map((c) => [c.id, "off"]));
  expect(fetch).not.toHaveBeenCalled();
});

test("a configured service that is down is an error row naming its URL", async () => {
  vi.stubEnv("COMFYUI_URL", "http://127.0.0.1:8188");
  const cause = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed", { cause })));
  const { checks, runChecks } = await status();
  const [row] = await runChecks(checks.filter((c) => c.id === "comfyui"));
  expect(row?.state).toBe("error");
  expect(row?.detail).toMatch(/^could not reach http:\/\/127\.0\.0\.1:8188\/(system_stats|queue): ECONNREFUSED$/);
});
