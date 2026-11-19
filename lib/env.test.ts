import { expect, test, vi } from "vitest";

test("blank and whitespace-only values mean unset", async () => {
  vi.stubEnv("COMFYUI_URL", "");
  vi.stubEnv("OLLAMA_BASE_URL", "   ");
  const { env } = await import("@/lib/env");
  expect(env().COMFYUI_URL).toBeUndefined();
  expect(env().OLLAMA_BASE_URL).toBeUndefined();
});

test("values are trimmed", async () => {
  vi.stubEnv("COMFYUI_URL", "  http://127.0.0.1:8188 ");
  const { env } = await import("@/lib/env");
  expect(env().COMFYUI_URL).toBe("http://127.0.0.1:8188");
});
