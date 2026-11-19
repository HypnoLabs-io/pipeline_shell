import "server-only";
import { z } from "zod";

// Empty strings in .env files mean "unset", so they collapse to undefined.
const optional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const schema = z.object({
  COMFYUI_URL: optional,
  OLLAMA_BASE_URL: optional,
  ANTHROPIC_API_KEY: optional,
  OPENAI_API_KEY: optional,
  OPENAI_COMPAT_BASE_URL: optional,
  OPENAI_COMPAT_API_KEY: optional,
  OPENAI_COMPAT_NAME: optional,
  LLM_MODEL: optional,
  VISION_MODEL: optional,
  FFMPEG_PATH: optional,
  FFPROBE_PATH: optional,
  RESOLVE_INSTALL_DIR: optional,
});

export type Env = z.infer<typeof schema>;

/** Every variable the app reads. */
export const ENV_VARS = Object.keys(schema.shape) as (keyof Env)[];

let cached: Env | undefined;

/** Server-side env, parsed once. Every field is optional: unset means that integration is off. */
export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}
