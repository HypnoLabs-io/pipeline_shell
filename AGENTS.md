<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## This project

pipeline_shell is a Next.js 16 shell for media pipelines. FFmpeg, HyperFrames, OpenTimelineIO, ComfyUI, local and hosted LLMs, and DaVinci Resolve are each optional.

- **Run.** `npm run setup` once, then `npm run dev`. Before every commit, `npm run verify` (lint, typecheck, tests, build) must pass. CI runs the same steps.
- **Next 16 specifics.** Cache Components is on, so a route can't export `dynamic` or `runtime`. Call `await connection()` to render per request.
- **Integrations are plug-ins.** Unset env means "off", a broken service means an "error" row on the status page, and no code path may depend on one being up. Follow the checklist in `docs/integrations.md` to add one.
- **Validate at the boundary.** Every HTTP response goes through `fetchJson` (`lib/http.ts`) and every CLI's JSON through `runJson` (`lib/exec.ts`), each with a zod schema that declares only the fields you read. Trust the parsed types after that.
- **Server only.** The wrappers in `lib/integrations/`, `lib/media/` and `lib/timeline/` start with `import "server-only"`. Binaries get their arguments as an array through `execFile`, never as a shell string.
- **Tests.** `npm test` runs Vitest. `npx vitest run <file>` runs one file. Tests stub `fetch` and never call a real service or spend money. The OTIO tests run the real sidecar, so they need uv. `vitest.setup.ts` blanks the env and resets modules before each test, so set env with `vi.stubEnv` and import the module under test inside the test. When a test fails, fix the code, not the test.
- **Secrets** live in `.env.local`, which git ignores. Keep them out of argv, commits and logs.
- **The `minimatch` override** in `package.json` is a security fix (GHSA-g3hv-75wg-m249). shadcn 4.23 pulls ts-morph 26, whose `@ts-morph/common` asks for `minimatch ^10`. Drop the override once shadcn moves to ts-morph 28, which asks for v11 (`npm ls ts-morph`).
- **Timelines.** An EDL has no frame rate, so the OTIO sidecar refuses to read one without `--rate`.
