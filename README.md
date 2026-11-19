# pipeline_shell

A Next.js shell for video pipelines. It wires HyperFrames, FFmpeg, OpenTimelineIO, ComfyUI, local and hosted LLMs, and a DaVinci Resolve MCP server, and each one is optional. The home page shows which of them are working.

Use it as a template. Fork it, keep the integrations your pipeline needs, and build on the typed wrappers in `lib/`. Nothing here assumes a particular GPU, model or service. An integration you never configure shows as "off" and stays out of the way.

## What you need

- Node 22.12 or later. `.nvmrc` pins the major version.
- [uv](https://docs.astral.sh/uv/) for the OpenTimelineIO sidecar. It fetches the pinned Python 3.12 itself.
- `ffmpeg` and `ffprobe` on PATH. On Linux x86_64, `bash tools/install-ffmpeg.sh --link` installs the build HyperFrames tests against.
- Network access for `npm run build`, which fetches the Geist font, and for HyperFrames renders, which load GSAP from a CDN.
- Optional, each one turned on from `.env.local`: ComfyUI, Ollama, an Anthropic, OpenAI or OpenAI-compatible API key, and DaVinci Resolve Studio on Linux.

## Run it

```bash
npm install
npm run setup    # creates .env.local, checks ffmpeg and uv, syncs the OTIO sidecar
npm run dev      # http://localhost:3000
```

`npm run setup` is safe to rerun. It never overwrites `.env.local`, and it ends with a list of anything still missing. With an empty `.env.local`, every service-backed integration on the status page shows "off". FFmpeg, HyperFrames and OpenTimelineIO show "ready" once their tools are installed, and "error" with the reason until then. [`docs/integrations.md`](docs/integrations.md) covers turning each one on, and `npm run video:doctor` lists anything HyperFrames still needs.

## Check your work

`npm run verify` runs lint, typecheck, the Vitest suite and the production build. CI runs the same four steps on every push to `main` and every pull request (`.github/workflows/ci.yml`). Tests sit next to the code as `*.test.ts`, stub the network, and never call a real service. The OTIO tests run the local sidecar, so they need uv. `npm run test:watch` reruns them on save.

## Layout

```
app/                    Next.js App Router: status page, /api/integrations
lib/media/              ffmpeg, hyperframes
lib/timeline/           OpenTimelineIO (calls tools/otio)
lib/integrations/       comfyui, llm, video-llm, resolve, status
lib/{env,exec,http}.ts  env parsing, the CLI runner, the HTTP client
components/ui/, hooks/  shadcn components (all of them, base-nova style) and their hooks
video/                  HyperFrames composition project
tools/otio/             uv project pinning OpenTimelineIO and its adapters
workflows/comfyui/      ComfyUI graphs in API format
scripts/setup.mjs       first-run setup
docs/integrations.md    how each integration turns on, and how to add one
AGENTS.md               project rules for coding agents (CLAUDE.md imports it)
```

Stack: Next.js 16.4 (Turbopack, Cache Components), React 19.3, Tailwind 4.3, shadcn 4.23, Vercel AI SDK 7, Vitest 5, HyperFrames 0.9.70, OpenTimelineIO 0.18.1.

## Make it yours

1. Rename it. `git grep -n pipeline` finds every spot, from `package.json` and the page title to the ComfyUI client id and the OTIO sidecar's package name.
2. Keep the integrations you use. The rest cost nothing while they're "off". To remove one from the code, follow the last section of `docs/integrations.md`.
3. Add your own with the checklist in [Adding an integration](docs/integrations.md#adding-an-integration).
4. Build your pipeline steps as server code on top of the wrappers. `lib/integrations/video-llm.ts` is a small example that chains ffmpeg frame sampling into a vision model.
5. Update the "This project" section of `AGENTS.md` as your rules change. Coding agents read it first.

## Coding agents

`AGENTS.md` holds the project rules for any coding agent, and `CLAUDE.md` imports it for Claude Code. The part between the `nextjs-agent-rules` markers belongs to Next.js, and `next dev` rewrites it. `video/` has its own `AGENTS.md` and `CLAUDE.md` from HyperFrames, which point at the HyperFrames agent skills. Install those once per machine with `npx hyperframes skills update` if you want an agent to edit compositions.

## License

MIT, in [`LICENSE`](LICENSE).
