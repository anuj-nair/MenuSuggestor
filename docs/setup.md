# Setup

First-time environment setup. See [running.md](running.md) for day-to-day
run commands and [architecture.md](architecture.md) for how the pieces fit
together.

## Prerequisites

| Tool | Needed for | Notes |
|---|---|---|
| Node.js 18+ | Client + server | Repo tested with Node 24. |
| Python 3.10+ | Recipe import (optional) | Only needed for "paste text / link" import in Manage. |
| [Ollama](https://ollama.com) | Recipe import (optional) | Runs the local LLM used to structure recipes. |

Everything except recipe import works with just Node.js — the app is fully
usable via manual meal entry without Python or Ollama installed at all.

## 1. Install app dependencies

From the repo root:

```bash
npm run install:all      # installs server + client dependencies
```

## 2. Configure the server environment

```bash
cp server/.env.example server/.env
```

`server/.env` defaults are fine for local use:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | Express port |
| `DB_PATH` | `./data/menu_suggestor.db` | SQLite file location |
| `RECIPE_INGEST_PYTHON` | `../recipe_ingestion/.venv/bin/python` | Interpreter used to run recipe import |
| `RECIPE_INGEST_TIMEOUT_MS` | `300000` (5 min) | Recipe import subprocess timeout |

## 3. Create and seed the database

```bash
npm run server:migrate   # creates the SQLite schema (server/data/menu_suggestor.db)
npm run server:seed      # inserts a small starter catalog (optional but recommended)
```

At this point the app is usable — jump to [running.md](running.md) — with
manual meal entry only. Continue below to enable recipe import from a URL or
pasted text.

## 4. (Optional) Set up recipe import

Recipe import runs a standalone Python tool
([recipe_ingestion/README.md](../recipe_ingestion/README.md)) as a subprocess
per request. It never touches the app's database directly — it only returns
JSON that you review and save through the normal Manage UI.

### 4a. Python virtualenv

```bash
cd recipe_ingestion
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
cd ..
```

`server/.env`'s `RECIPE_INGEST_PYTHON` already points at
`recipe_ingestion/.venv/bin/python` by default, so no server config change is
needed once the venv exists.

### 4b. Ollama + model

```bash
# macOS: brew install ollama && brew services start ollama
# Linux:  curl -fsSL https://ollama.com/install.sh | sh   (installs a systemd service)
ollama pull gemma4:e2b   # ~7GB, Google's smaller edge variant
```

Smoke-test it:

```bash
curl -s http://localhost:11434/api/chat -d '{"model": "gemma4:e2b", "messages": [{"role": "user", "content": "hi"}], "stream": false}'
```

If `gemma4:e2b` is too slow/heavy for a given machine, swap to a different
small instruct model (e.g. `qwen2.5:3b-instruct`, `llama3.2:1b`) and set
`OLLAMA_MODEL` in `recipe_ingestion/.env` — no code changes needed. To run
Ollama on a different machine than the app, set `OLLAMA_HOST` in that same
`.env` to `http://<ip>:11434`.

## Troubleshooting

- **"Recipe import isn't set up yet"** when using paste text / link in
  Manage → the venv at `recipe_ingestion/.venv` doesn't exist yet, or
  `RECIPE_INGEST_PYTHON` in `server/.env` points somewhere wrong. Redo step 4a.
- **Recipe import times out** on a slow/CPU-only machine → raise
  `RECIPE_INGEST_TIMEOUT_MS` in `server/.env`, or switch to a smaller Ollama
  model (step 4b).
- **A recipe site returns "wouldn't let us read the recipe"** → the site
  blocked the scrape (403/429/Cloudflare challenge); copy the recipe text
  from your browser and use the paste-text import instead.
