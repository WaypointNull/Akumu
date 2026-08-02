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
- `src/routes/apiRoutes.js`: API routes.
- `src/services/*`: business logic (Ollama, prompts, regional jobs, Comfy integration, discovery, tag list).
- `src/utils/tagUtils.js`: shared tag parsing/normalization helpers.
