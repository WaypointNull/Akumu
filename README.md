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
npm start
```

Open:

`http://127.0.0.1:5177`

## Notes

- The app downloads the danbooru tag list once into `data/danbooru-tags.txt`.
- LoRA tags should be entered as inline tags, one per line, for example:
  `<lora:neekoil:1.2>`
- Final output keeps only GLOBAL_POSITIVE and GLOBAL_NEGATIVE.
- Regional Painter uses ComfyUI API at `http://127.0.0.1:8188` by default.
- The server tries to discover ComfyUI installation folders and `models/checkpoints` automatically.
- Discovery scans common Windows install locations across user profiles, including `AppData/Local` Comfy Desktop installs.
- Regional Painter checkpoint selection is a dropdown populated from discovered checkpoint files.
- If discovery finds no checkpoints, set up ComfyUI/checkpoints first, then click Refresh Checkpoints.

## Code Structure

- `server.js`: bootstrap only.
- `src/app.js`: Express app wiring.
- `src/routes/apiRoutes.js`: API routes (the composition root — the only place modules are wired together).
- `src/config/constants.js`: tunable configuration (ports, URLs, tag lists, retrieval tuning, model defaults).
- `src/shared/list.js`: domain-free utils only (`dedupeKeepOrder`); no domain imports.
- `src/modules/tag-resolution/`: leaf module — `parser.js` (normalize/split/CSV), `metrics.js` (trigram + Damerau-Levenshtein), `repository.js` (tag set/alias tables), `aliases.js` (resolution rules), `retrieval.js` (BM25 index + fuzzy resolution). Depends only on `config`/`shared`.
- `src/modules/llm/`: leaf module — `ollama.js` thin Ollama client.
- `src/modules/prompt-engine/`: module — `orchestrator.js` composes the single-pipeline from swappable stages under `stages/`, plus `templates.js`, `regionalText.js`, `inference.js`, `formatter.js`, and `canonicalize/` (`text.js` pure Phase C builders, `service.js` LLM-driven canonicalization).
  - `stages/infer.js`: natural-language → booru tags (`translate`) + candidate extraction (`candidatesFromTagList`).
  - `stages/retrieve.js`: deterministic tag resolution against the tag list/aliases/rules (`resolveAll`, with ambiguous-tag logging).
  - `stages/canonicalize.js`: optional LLM-driven Phase C disambiguation of ambiguous tags (`apply`, no-op unless enabled).
  - `stages/regional.js`: global/regional/mask LLM prompt generation (`generateGlobalPrompt`, `generateRegionalPrompts`, `generateMaskPosePrompt`).
  - `stages/format.js`: resolution summary + final output (`finalize`).
- `src/modules/comfy/`: module — `svg.js` (SVG mask generation), `workflow.js` (Comfy graph), `client.js` (prompt submit + history poll), `discovery.js` (local ComfyUI discovery).
- `src/modules/regional-painter/`: module — `jobService.js` (regional job orchestration, Comfy submission, simple masks).
- `src/modules/benchmark/`: module — `datasets.js` (corpus/cases), `generator.js` (corruption case generation), `scorer.js` (offline scoring, Phase C and rules evals).
- `scripts/*`: thin CLIs over the above (benchmark, rule learning).
- `docs/ARCHITECTURE.md`: how modules and folders are organized, and how to add a new stage.

The organizing principle is **module-first**: everything is a module that works on its own and can be swapped in/out, and the folder structure reflects that. The target module layout (`src/modules/*`) is in `docs/ARCHITECTURE.md`; the tree above is the current layout while that move is pending. Every module exposes a public interface via `index.js` and imports other modules only through it.

Layering is strict and one-way: leaf domains (`tag`, `llm`, `comfy`) import only `config`/`shared`; mid domains (`canonicalize`, `prompt`) import only leaves; top domains (`pipeline`, `regional`, `benchmark`) import only mids/leaves. A module never crosses into a sibling or parent domain on its own.

Each pipeline stage is an independent module with a small, injectable interface (LLM calls and tag resolution are dependency-injected), so a stage can be swapped or benchmarked in isolation and is covered by its own unit tests.

## Tests

```powershell
npm test
```

Pure-function unit tests using the built-in `node:test` runner (no external test dependency).
