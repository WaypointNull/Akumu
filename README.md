<h1 align="center">Akumu</h1>

<p align="center">Describe the scene in plain English. Get a clean, validated booru-style prompt out.</p>

<p align="center">
<img alt="Node" src="https://img.shields.io/badge/node-%3E%3D18-339933?style=for-the-badge" />
<img alt="Runtime" src="https://img.shields.io/badge/runtime-Ollama%20%2B%20Express%20%2B%20Vue%203-4f5bd5?style=for-the-badge" />
<img alt="License" src="https://img.shields.io/badge/license-WaypointNull%20v1.0-2e7d5b?style=for-the-badge" />
</p>

<p align="center">
<a href="#features">Features</a> · <a href="#how-it-works">How it works</a> · <a href="#quick-start">Getting Started</a> · <a href="#development">Development</a> · <a href="#troubleshooting">Troubleshooting</a>
</p>

<p align="center"><img src="client/public/akumu.png" alt="Akumu" width="160" /></p>

Akumu turns natural language into booru-style prompt tags using a **local Ollama model**. Describe the image you want in plain English — _"Neeko from League of Legends, sitting on a rock in a jungle, innocent confused expression, looking at the viewer"_ — and Akumu translates it into proper tags, checks every one against a real danbooru tag list, and formats the result into `GLOBAL_POSITIVE` / `GLOBAL_NEGATIVE` sections ready for your image-generation workflow.

> [!NOTE]
> Everything runs locally on your machine. Akumu talks to your own Ollama instance — no cloud, no accounts, no telemetry.

## Features

- **Natural language → tags.** Describe the scene; a local LLM converts it to booru-style tags.
- **Validated against 320k+ real tags.** Every tag is checked against the danbooru tag list — aliases, fuzzy matches, and compound tags are resolved deterministically (no LLM).
- **Clean, consistent output.** Final prompts always include the baseline quality tags and are formatted into `GLOBAL_POSITIVE` and `GLOBAL_NEGATIVE` sections.
- **Tag Review.** Tags that can't be confidently resolved are surfaced with candidate suggestions — keep the original, pick a candidate, or remove it, and the output re-renders instantly.
- **LoRA triggers.** Paste LoRA trigger lines and they're inserted verbatim into the output.
- **Live Ollama status.** A status pill shows whether Ollama is reachable and how many models are installed; pick any model from the dropdown.
- **Copy in one click.** Grab the finished prompt straight to your clipboard.

## How it works

Akumu runs a 3-pass pipeline:

```
Natural language
   │   Pass 1 · Translate   (LLM — the only AI pass)
   ▼
Raw booru-style tags
   │   Pass 2 · Validate    (deterministic — tag list, aliases, fuzzy match)
   ▼
Resolved tags
   │   Pass 3 · Format      (deterministic — boilerplate + GLOBAL sections)
   ▼
GLOBAL_POSITIVE + GLOBAL_NEGATIVE
```

Only Pass 1 uses a model. Passes 2 and 3 are deterministic, so the same input always produces the same output.

## Requirements

- **Ollama** running locally (default `http://127.0.0.1:11434`). Install from [ollama.com](https://ollama.com) and make sure it's running.
- **At least one Ollama model**, for example:

  ```powershell
  ollama pull qwen2.5:7b
  ```

- **Node.js 18+** from [nodejs.org](https://nodejs.org).

## Quick start

```powershell
npm install
npm run build
npm start
```

Then open **http://127.0.0.1:5177**

On first run, Akumu downloads the danbooru tag list once into `data/danbooru-tags.txt` (~320k tags). This takes a moment and happens only the first time.

### Tips

- LoRA tags should be entered as inline tags, one per line — for example `<lora:neekoil:1.2>`.
- The final output keeps only `GLOBAL_POSITIVE` and `GLOBAL_NEGATIVE`; required baseline tags are always present.

## Development

Hot-reload for hacking on the UI or the API:

```powershell
npm run dev
```

This runs both processes: the Express API on `http://127.0.0.1:5177` and the Vite dev server on `http://127.0.0.1:5173`, which proxies `/api` to Express. `npm run build` compiles the Vue app into `client/dist`, which `npm start` serves from the same origin.

| Command          | What it does                                            |
| ---------------- | ------------------------------------------------------- |
| `npm test`       | Unit tests (`node:test`, no external test dependencies) |
| `npm run lint`   | ESLint                                                  |
| `npm run format` | Prettier                                                |
| `npm run bench`  | Offline danbooru-resolution benchmark                   |

### Project layout

- `server/` — Express API. `server/src/modules/*` are self-contained, swappable modules (tag resolution, Ollama client, prompt pipeline). See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
- `client/` — Vue 3 + Vite single-page app.
- `scripts/` — thin CLI tools (dev, benchmark).
- `data/` — runtime data (the downloaded tag list).

## Troubleshooting

**The status pill says "Ollama offline".** Make sure the Ollama app is running (it listens on `http://127.0.0.1:11434` by default), then click **Refresh Models**.

**The model dropdown is empty.** Pull a model first (`ollama pull qwen2.5:7b`) and click **Refresh Models**.

**Nothing happens when I press Run.** Enter a description in the **Natural Language Input** box first.

**First run seems stuck downloading tags.** A ~320k-line tag list is being fetched; give it a moment. It only happens once.

**Port 5177 is already in use.** Change `PORT` in `server/src/config/constants.js`.

## License

[WaypointNull Community License v1.0](LICENSE.md) — free to use, copy, and modify, but **no commercial use**.
