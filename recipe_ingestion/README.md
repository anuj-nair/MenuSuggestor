# recipe_ingestion (experimental)

A standalone Python library + CLI to pull recipes out of recipe website URLs
or pasted recipe text, structure them with a locally-run Gemma model (served via
[Ollama](https://ollama.com)), and save each one as an inspectable JSON file.
This is a testbed, decoupled from the Node/Express app in `../server` — it
does **not** write to the app's SQLite DB. The JSON schema is designed so a
batch of these files can be imported into that DB later without a redesign
(see "Mapping to the product DB" below).

The LLM step talks to a local Ollama server over HTTP, so it runs the same
way on any machine Ollama supports (tested on an Apple Silicon Mac and a
headless Linux/Proxmox box with only a weak GPU — Ollama falls back to CPU
inference there and it still works, just slower).

## Setup

```bash
cd recipe_ingestion
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

cp .env.example .env
```

Install and start Ollama, then pull the model this tool defaults to:

```bash
# macOS: brew install ollama && brew services start ollama
# Linux:  curl -fsSL https://ollama.com/install.sh | sh   (installs a systemd service)
ollama pull gemma4:e2b   # ~7GB, Google's smaller edge variant
```

Smoke-test that Ollama can actually answer:

```bash
curl -s http://localhost:11434/api/chat -d '{"model": "gemma4:e2b", "messages": [{"role": "user", "content": "hi"}], "stream": false}'
```

If `gemma4:e2b` is too slow/heavy for a given machine (e.g. an old CPU-only
box), there isn't currently a smaller Gemma 4 tag in Ollama's library — try
a different small instruct model (e.g. `qwen2.5:3b-instruct` or
`llama3.2:1b`) and set `OLLAMA_MODEL` in `.env` accordingly; no code changes
needed. To run Ollama on a different machine than this tool, set
`OLLAMA_HOST` in `.env` to that machine's `http://<ip>:11434`.

## Usage

```bash
recipe-ingest ingest-website "https://plantyou.com/chili-oil-peanut-noodles/"
recipe-ingest ingest-text recipe.txt                # or: pbpaste | recipe-ingest ingest-text
recipe-ingest ingest-text recipe.txt --reference "https://where-it-came-from"
recipe-ingest list
recipe-ingest show <id-or-prefix>
```

Each successful ingest writes `output/recipes/<uuid>.json` (metadata block +
structured recipe block) and pretty-prints the result to the terminal. One
input always produces one recipe; section headings in the source (e.g.
"Chicken", "Sauce") become each ingredient's `group`.

### Website extraction

The page is fetched once with plain `requests` (browser-like headers; no
JavaScript runs, so cookie/consent/ad overlays never block anything).

1. **Structured** (`website_structured`) — `recipe-scrapers` in `wild_mode`
   reads the site's schema.org `Recipe` JSON-LD (present on almost every
   recipe blog) or its known-site parser.
2. **Fallback** (`website_raw_fallback`) — visible page text via
   BeautifulSoup, after removing cookie banners, ads, popups, newsletter
   prompts, comments and share widgets, and narrowed to the recipe card
   (WP Recipe Maker, Tasty, Mediavine, `itemtype=Recipe`) when one exists.

If the site blocks the request (HTTP 403/429, Cloudflare challenge), the error
tells you to copy the text from your browser and use `ingest-text`.

### Pasted text extraction

`ingest-text` takes any unstructured recipe text (ingredient lists with or
without headings, with or without steps). Missing instructions are saved as
`[]` with a note in `confidence_notes` — Gemma is told never to invent steps.

### Checks on Gemma's output

After JSON/schema validation, `validate_recipe()` checks that every
ingredient's `raw_text` actually appears in the source text (catches
hallucinated ingredients), that the ingredient count matches the page's
structured data when available, and that `notes` carries the Reference line.
Any failure triggers one repair pass with the problems fed back to Gemma; if
only these content checks still fail, the recipe is kept and the problems are
recorded in `metadata.validation_warnings` and `confidence_notes`.

## Mapping to the product DB (`server/src/db/schema.sql`)

| JSON field | SQL destination |
|---|---|
| `recipe.name` | `meals.name` |
| `recipe.notes` (always starts with `Reference: <url>`) | `meals.notes` |
| `recipe.meal_types[]` | one row per entry in `meal_types` |
| `recipe.cuisines[]` | one row per entry in `meal_cuisines` |
| `recipe.ingredients[].name/quantity/unit` | upsert `ingredients`, insert `meal_ingredients` |
| `recipe.ingredients[].tags[]` | `ingredient_tags` |
| `recipe.ingredients[].group` | no column yet — note `meal_ingredients` is `UNIQUE (meal_id, ingredient_id)`, so the same ingredient in two groups must be summed or the constraint relaxed |
| `recipe.instructions`, `servings`, `total_time_minutes` | no column yet — needs a future migration |
| `metadata.*` | tool-local only, never migrated |

The `notes` field is guaranteed to carry a `Reference: <url>` line pointing
back to the original webpage (or `Reference: pasted text` for pasted input), since `metadata.raw_source_text` and the
rest of the audit trail won't survive an import into the product DB.

## Tests

```bash
pytest
```
