import { beforeEach, vi } from "vitest";
import { ENV_VARS } from "@/lib/env";

// lib/ caches env() and the LLM registry per module, and a developer's shell may export real keys.
// Every test starts from fresh modules and a blank environment, then stubs what it needs.
beforeEach(() => {
  vi.resetModules();
  for (const key of ENV_VARS) vi.stubEnv(key, "");
});
