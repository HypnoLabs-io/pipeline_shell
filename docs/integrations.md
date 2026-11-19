# Integrations

Every integration is a plug-in. It turns on from `.env.local` or from what's installed on the box, and nothing in the app hard-depends on it. When one is down, the status page shows it as "error" or "off" and the rest keeps working.

Check them all at once with `npm run dev`, then open `/` or `GET /api/integrations`. Each row is `{ id, name, state, detail }` with `state` one of `ok`, `off`, `error`. The checks live in `lib/integrations/status.ts`.

## FFmpeg

`lib/media/ffmpeg.ts` runs the `ffmpeg` and `ffprobe` on PATH. Set `FFMPEG_PATH` or `FFPROBE_PATH` to use other binaries.

- `probe(file)` returns ffprobe JSON, validated.
- `sampleFrames({ file, count, width })` pulls evenly spaced JPEG stills. The video LLM uses it.
- `ffmpeg(args)` is the raw call. It goes through `execFile`, so arguments are never shell-interpreted.

Any recent ffmpeg works for the app. HyperFrames renders are tested against one static 8.0.1 build, the one its render Dockerfile pins, and `npm run video:doctor` says whether yours is that build. Distro packages are often older (Ubuntu 24.04 ships 6.1.1). On Linux x86_64 the script installs the tested build without sudo. On other platforms, install ffmpeg from your package manager and check it with `video:doctor`.

```bash
bash tools/install-ffmpeg.sh --link   # every project: links into ~/.local/bin, ahead of /usr/bin
bash tools/install-ffmpeg.sh          # install only, no PATH change
```

The script downloads that build, checks its sha256, and unpacks `ffmpeg` and `ffprobe` into `~/.local/opt/ffmpeg/n8.0.1-66-g27b8d1a017/bin`. `--link` won't replace anything already in `~/.local/bin`. To use that build for this project only, skip `--link`. Set `FFMPEG_PATH` and `FFPROBE_PATH` in `.env.local` for the app, and export `HYPERFRAMES_FFMPEG_PATH` and `HYPERFRAMES_FFPROBE_PATH` in your shell for the HyperFrames CLI, which doesn't read `.env.local`. Undo the link with `rm ~/.local/bin/ffmpeg ~/.local/bin/ffprobe`.

## HyperFrames

The CLI is a pinned devDependency (`hyperframes@0.9.70`). `video/` is a composition project scaffolded with `hyperframes init`.

```bash
npm run video:preview    # studio in the browser
npm run video:check      # lint, runtime, layout, contrast as JSON
npm run video:snapshot   # stills under video/.hyperframes/artifacts/snapshots/
npm run video:render     # renders/video.mp4 at "looks" quality
npm run video:doctor     # environment check
```

`lib/media/hyperframes.ts` wraps `doctor`, `check` and `render` for server code. Renders land in `renders/`, which git ignores. Checks and renders run in a headless Chrome that HyperFrames manages under `~/.cache/hyperframes/`, falling back to a system Chrome. `video:doctor` reports which one it found.

`video/CLAUDE.md` tells Claude Code to load the HyperFrames agent skills (`/hyperframes`, `/hyperframes-cli` and the others it lists). They aren't vendored here. The scaffold ran with `HYPERFRAMES_SKIP_SKILLS=1` to keep a copy out of the repo. Install or refresh them once per machine with `npx hyperframes skills update`. It installs them under `~/.claude/skills` and copies them into `~/.agents/skills`.

Transcription uses HyperFrames' own pinned whisper-cpp (v1.9.5). The first `npx hyperframes transcribe` compiles it CPU-only into `~/.cache/hyperframes/whisper/`, which needs git and cmake but no sudo, and downloads the default `small.en` model. Until then, `doctor` and the status page list it as a missing optional extra.

## OpenTimelineIO

OTIO is Python only, so it runs as a sidecar in `tools/otio/`, managed by [uv](https://docs.astral.sh/uv/). It pins `opentimelineio==0.18.1`, the plugins bundle (EDL, FCP7 XML, AAF and others), the FCPXML adapter, and Python 3.12 (`tools/otio/.python-version`; uv downloads it if it's missing).

```bash
npm run otio:sync                          # create tools/otio/.venv (npm run setup does this)
npm run otio -- version                    # OTIO version and adapter names
npm run otio -- inspect cut.otio           # tracks, clips, ranges as JSON
npm run otio -- convert cut.otio cut.edl
npm run otio -- convert cut.edl cut.otio --rate 30   # an EDL has no frame rate, so --rate is required
```

Reading an EDL without `--rate` fails with a message. OTIO would otherwise assume 24 fps and shift every timecode in a 25 or 30 fps cut.

From Node, use `lib/timeline/otio.ts` (`version`, `inspect`, `convert`; pass `rate` for an EDL). Native `.otio` is plain JSON, so Node can write a timeline itself and leave the format adapters to the sidecar. Resolve 18.5 and later imports `.otio` directly, which makes it the handoff format into Resolve.

## ComfyUI

Set `COMFYUI_URL` to a running ComfyUI, usually `http://127.0.0.1:8188`. The API is unauthenticated and the client polls `/history` instead of holding a websocket.

`lib/integrations/comfyui.ts` exposes `health`, `checkpoints`, `queue(graph)`, `wait(promptId)`, `fetchImage` and `txt2img(options)`. Workflow graphs are API-format JSON in `workflows/comfyui/`. `sdxl-txt2img.json` is a stock SDXL text-to-image graph. `txt2img` uses the first installed checkpoint unless you name one, and its defaults (1024x1024, 25 steps, cfg 7) suit an SDXL checkpoint. `txt2img` returns the images as PNG buffers and saves nothing. Write them under `outputs/`, which git ignores.

To add a workflow, export it from ComfyUI with "Save (API Format)", drop it in `workflows/comfyui/`, and fill its inputs by node id the way `txt2img` does.

## LLMs

One Vercel AI SDK registry in `lib/integrations/llm.ts`. A provider registers only when its env is set.

| Provider | Env | Model id example |
| --- | --- | --- |
| Ollama (local) | `OLLAMA_BASE_URL=http://127.0.0.1:11434/v1` | `ollama:qwen3:14b` |
| Anthropic | `ANTHROPIC_API_KEY` | `anthropic:claude-opus-5-5` |
| OpenAI | `OPENAI_API_KEY` | `openai:<model>` |
| Any OpenAI-compatible endpoint | `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_API_KEY`, `OPENAI_COMPAT_NAME` | `openrouter:<vendor>/<model>` |

Model ids are `<provider>:<model>`. The registry splits on the first colon, so Ollama tags keep theirs. `LLM_MODEL` and `VISION_MODEL` are the defaults when a caller doesn't name one. `.env.example` suggests `ollama:qwen3:14b` and `ollama:gemma4:26b`. Pull those with `ollama pull`, or name models you already have.

The status page only checks that hosted providers have a key. A live call there costs money. Don't send `temperature`, `topP` or `topK` to Anthropic models, because current Claude models reject sampling parameters.

For OpenRouter, set `OPENAI_COMPAT_BASE_URL=https://openrouter.ai/api/v1` and `OPENAI_COMPAT_NAME=openrouter`. vLLM and LM Studio work the same way with their local URLs.

## Video LLMs

`describeVideo({ file, prompt, frames, model })` in `lib/integrations/video-llm.ts` samples `frames` stills with ffmpeg and sends each one to a vision model as an image, labelled with its timestamp. None of the configured providers accept video files, so this works with any vision model in the registry, such as `gemma4` or `llava` on Ollama or a hosted Claude or GPT model.

Frame sampling misses motion between stills. Raise `frames` for fast cuts, and remember every frame is another image in the prompt.

## DaVinci Resolve (MCP)

An AI agent drives Resolve through the [davinci-resolve-mcp](https://github.com/samuelgursky/davinci-resolve-mcp) server, pinned here to 5.3.4. The app doesn't talk to Resolve. `lib/integrations/resolve.ts` only reports `not-installed`, `installed-not-running` or `running`, by looking for `bin/resolve` under `RESOLVE_INSTALL_DIR` (default `/opt/resolve`) and for a running `resolve` process. That check and the paths below assume Linux.

The repo doesn't register the MCP server, so nobody gets asked to start a server for software they don't have. Register it yourself once Resolve is installed.

To turn it on:

1. Install DaVinci Resolve. External scripting needs Studio. The free edition needs the server's in-app bridge (`python scripts/install_resolve_bridge.py` from its repo), and the server's README says Python support in free 21.1 is unconfirmed.
2. In Resolve, set Preferences > General > External scripting using to Local.
3. Run `npx davinci-resolve-mcp@5.3.4 setup`. It builds a venv under `~/.local/share/davinci-resolve-mcp` and finds Resolve's paths.
4. Register it with Claude Code. Change `/opt/resolve` in all three paths if Resolve lives elsewhere, and set `RESOLVE_INSTALL_DIR` in `.env.local` to match.

   ```bash
   claude mcp add davinci-resolve \
     -e RESOLVE_SCRIPT_API=/opt/resolve/Developer/Scripting \
     -e RESOLVE_SCRIPT_LIB=/opt/resolve/libs/Fusion/fusionscript.so \
     -e PYTHONPATH=/opt/resolve/Developer/Scripting/Modules \
     -- npx -y davinci-resolve-mcp@5.3.4 server
   ```

5. Check with `claude mcp get davinci-resolve`. Add `-s project` to step 4 instead if you want the registration in a committed `.mcp.json` for your team.

## Adding an integration

The contract: unset means "off", broken means an "error" row, and nothing else in the app depends on it.

1. **Env.** Add the variable to the schema in `lib/env.ts` (every field is optional, and blank means unset), and a commented-out example to `.env.example`.
2. **Wrapper.** Write `lib/integrations/<name>.ts` (or `lib/media/`, `lib/timeline/`). Start it with `import "server-only"`. Send every HTTP response through `fetchJson` (`lib/http.ts`) and every CLI's JSON through `runJson` (`lib/exec.ts`), each with a zod schema that declares only the fields you read.
3. **Status row.** Add a `Check` to `checks` in `lib/integrations/status.ts`. Set `enabledBy` to `"env"` if a variable turns it on, or `"install"` if a tool on the machine does. Return `off("<VAR> not set")` when it isn't configured, and let real failures throw. `runChecks` turns a throw into an "error" row with the message as its detail.
4. **Tests.** The fresh-clone test in `lib/integrations/status.test.ts` already covers every `"env"` check and fails if yours errors or touches the network with its variables unset. Test the wrapper itself with `fetch` stubbed (see `lib/http.test.ts`). Never call a real service from a test.
5. **Docs.** Add a section to this page: what turns it on, what it exposes, and how to install the service.

`npm run verify` runs lint, typecheck, tests and the build, the same gate CI runs.

To drop an integration you don't need, leave its env unset and it stays "off". To remove it from the code, delete its wrapper, its `Check`, its env entries and its section here in one change.
