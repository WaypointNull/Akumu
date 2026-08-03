# Ollama Prompt Workflow UI

Simple local UI with 2 modes:

1. Single Prompt mode (3-pass pipeline).
2. Regional Painter mode (async global/regional prompt generation + async ComfyUI RGB mask generation).

Single mode pipeline:

1. Translate natural language to booru-style tags.
2. Validate tags against a danbooru tag list.
3. Format final output as only:
   - GLOBAL_POSITIVE
   - GLOBAL_NEGATIVE

It normalizes final output so required baseline tags are always present.

Regional mode workflow:

1. Natural language -> GLOBAL_POSITIVE
2. In parallel:

- Generate RED/GREEN/BLUE channel prompts + GLOBAL_NEGATIVE
- Submit a ComfyUI job to generate an RGB mask image on black background

3. Poll job status from the UI until complete

Regional mode UI:

1. Basic mode:

- ComfyUI URL
- Checkpoint dropdown (auto-discovered)

2. Advanced mode:

- Width/height
- Steps
- CFG
- Sampler
- Scheduler

## Requirements

- Ollama running locally (`http://127.0.0.1:11434`)
- At least one installed model, for example `qwen2.5:7b`
- Node.js 18+

## Run

```powershell
cd "c:\Users\wendy\OneDrive\Desktop\AI shit\ollama-prompt-workflow-ui"
npm install
npm run build
npm start
```

Open:

`http://127.0.0.1:5177`

Development (hot reload):

```powershell
npm run dev
```

`npm run dev` runs both processes: the Express API on `http://127.0.0.1:5177` and the Vite dev server on `http://127.0.0.1:5173` (which proxies `/api` to Express). `npm run build` compiles the Vue app into `client/dist`, which `npm start` serves from the same origin.

## Notes

- The app downloads the danbooru tag list once into `data/danbooru-tags.txt`.
- LoRA tags should be entered as inline tags, one per line, for example:
  `<lora:neekoil:1.2>`
- Final output keeps only GLOBAL_POSITIVE and GLOBAL_NEGATIVE.
- Pass 2 (tag resolution) and Pass 3 (boilerplate formatting) are deterministic — no LLM. Only Pass 1 (translation) uses a model; its selector is the only model field in the Single Prompt panel.
- Ambiguous tags are resolved transparently: exact/alias/fuzzy matches auto-resolve, invented compounds whose parts all match a real tag auto-decompose, and anything left is kept in the output and shown in the Tag Review panel where you can keep the original, pick a candidate chip, or remove it (the final output re-renders instantly).
- Regional Painter uses ComfyUI API at `http://127.0.0.1:8188` by default.
- The server tries to discover ComfyUI installation folders and `models/checkpoints` automatically.
- Discovery scans common Windows install locations across user profiles, including `AppData/Local` Comfy Desktop installs.
- Regional Painter checkpoint selection is a dropdown populated from discovered checkpoint files.
- If discovery finds no checkpoints, set up ComfyUI/checkpoints first, then click Refresh Checkpoints.

## Code Structure

- `server/server.js`: bootstrap only.
- `server/src/app.js`: Express app wiring (JSON body, `/api` router, static serving of `client/dist`).
- `server/src/routes/apiRoutes.js`: API routes (the composition root — the only place modules are wired together).
- `server/src/config/constants.js`: tunable configuration (ports, URLs, tag lists, retrieval tuning, model defaults, Comfy defaults, format caps).
- `server/src/shared/list.js`: domain-free utils only (`dedupeKeepOrder`); no domain imports.
- `server/src/modules/tag-resolution/`: leaf module — `parser.js` (normalize/split/CSV), `metrics.js` (trigram + Damerau-Levenshtein), `repository.js` (tag set/alias tables), `retrieval.js` (BM25 index + fuzzy resolution). Depends only on `config`/`shared`.
- `server/src/modules/llm/`: leaf module — `ollama.js` thin Ollama client.
- `server/src/modules/prompt-engine/`: module — `orchestrator.js` composes the single-pipeline from swappable stages under `stages/`, plus `templates.js`, `regionalText.js`, `formatter.js`, and `canonicalize/` (`text.js` pure Phase C builders, `service.js` LLM-driven canonicalization).
  - `stages/infer.js`: natural-language → booru tags (`translate`) + candidate extraction (`candidatesFromTagList`).
  - `stages/retrieve.js`: deterministic tag resolution against the tag list/aliases (`resolveAll`, with ambiguous-tag logging).
  - `stages/canonicalize.js`: optional LLM-driven Phase C disambiguation of ambiguous tags (`apply`, no-op unless enabled).
  - `stages/regional.js`: global/regional/mask LLM prompt generation (`generateGlobalPrompt`, `generateRegionalPrompts`, `generateMaskPosePrompt`).
  - `stages/format.js`: resolution summary + final output (`finalize`).
- `server/src/modules/comfy/`: module — `svg.js` (SVG mask generation), `workflow.js` (Comfy graph), `client.js` (prompt submit + history poll), `discovery.js` (local ComfyUI discovery).
- `server/src/modules/regional-painter/`: module — `jobService.js` (regional job orchestration, Comfy submission, simple masks).
- `server/src/modules/benchmark/`: module — `datasets.js` (corpus/cases), `generator.js` (corruption case generation), `scorer.js` (offline scoring and Phase C evals).
- `client/`: Vue 3 + Vite single-page app.
  - `client/vite.config.mjs`: Vite config; dev proxy `/api` → Express on :5177.
  - `client/src/App.vue`: shell — logo header, error banner, mode tabs.
  - `client/src/api.js`: fetch wrapper for the API.
  - `client/src/components/SinglePromptPanel.vue`: 3-pass form, outputs, and Tag Review.
  - `client/src/components/TagReviewList.vue`: review chips (candidates + decomposed parts).
  - `client/src/components/RegionalPainterPanel.vue`: regional workflow, advanced panel, polling.
  - `client/src/styles/main.css`: Material Design 3 black/pink design tokens + components.
- `scripts/*`: thin CLIs over the above (benchmark, dev).
- `docs/ARCHITECTURE.md`: how modules and folders are organized, and how to add a new stage.

The organizing principle is **module-first**: everything is a module that works on its own and can be swapped in/out, and the folder structure reflects that. The target module layout (`server/src/modules/*`) is in `docs/ARCHITECTURE.md`; the tree above is the current layout. Every module exposes a public interface via `index.js` and imports other modules only through it.

Layering is strict and one-way: leaf domains (`tag`, `llm`, `comfy`) import only `config`/`shared`; mid domains (`canonicalize`, `prompt`) import only leaves; top domains (`pipeline`, `regional`, `benchmark`) import only mids/leaves. A module never crosses into a sibling or parent domain on its own.

Each pipeline stage is an independent module with a small, injectable interface (LLM calls and tag resolution are dependency-injected), so a stage can be swapped or benchmarked in isolation and is covered by its own unit tests.

The client is a build-time-only dependency: `vue`, `vite`, and the ESLint/Prettier Vue tooling are dev dependencies. `express` remains the only runtime dependency.

## Tests

```powershell
npm test
```

Pure-function unit tests using the built-in `node:test` runner (no external test dependency).
