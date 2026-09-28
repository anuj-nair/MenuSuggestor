# Menu Suggestor

A personal weekly meal planner. Suggests one meal a day for the next 7 days, balanced across
grain types (salad, rice, roti, pasta, noodle, soup, other-grain) with an optional free day
(pizza/burger) and guaranteed chicken + tofu coverage. Includes a meal/ingredient catalog you
maintain yourself, and an editable meal history log.

## Docs

- [docs/architecture.md](docs/architecture.md) — system overview, component breakdown, data model, and key flows (with diagrams)
- [docs/setup.md](docs/setup.md) — first-time environment setup
- [docs/running.md](docs/running.md) — dev/prod run modes, tests, CLI tools
- [docs/api.md](docs/api.md) — REST endpoint reference

## Stack

- Frontend: React + Vite, plain CSS, `react-router-dom`
- Backend: Node.js + Express
- Database: SQLite (`better-sqlite3`)

## First-time setup

```bash
npm run install:all      # installs server + client dependencies
npm run server:migrate   # creates the SQLite schema
npm run server:seed      # inserts a small starter catalog (optional but recommended)
```

## Running locally

```bash
npm run dev
```

This starts the Express API on `http://localhost:4000` and the Vite dev server on
`http://localhost:5173` (which proxies `/api` requests to Express). Open
`http://localhost:5173` in a browser.

## Pages

- **Weekly Plan** (`/`) — view the current 7-day plan, generate/regenerate the week (with an
  "include free day" toggle), or refresh a single day.
- **Manage** (`/manage`) — add/edit/delete meals (name, cuisine, type, protein, notes) and link
  ingredients with quantities; manage the ingredient catalog. **+ Add Meal** offers three starts:
  manual, paste recipe text, or a recipe link. Text/link run `recipe_ingestion` (local Gemma via
  Ollama, see `recipe_ingestion/README.md`) and pre-fill the form for review before saving.
- **History** (`/history`) — view and edit what was actually eaten on any date, including
  free-text entries for uncatalogued meals; add or delete entries.

## Weekly generation rules

- One meal per day for 7 days, covering all 7 core types (salad, rice, roti, pasta, noodle,
  soup, grain) exactly once — unless the free-day toggle is on, in which case one of those 7
  slots is swapped for a `free` (pizza/burger) meal instead.
- At least one chicken meal and one tofu meal are guaranteed somewhere in the week (a single
  meal can satisfy both a type slot and a protein requirement, e.g. chicken biryani = rice +
  chicken).
- Refreshing a single day re-picks within that day's existing type and won't silently drop the
  week's only chicken/tofu meal — it either finds a safe alternative, or asks you to confirm
  with "Refresh anyway" if none exists.
- Regenerating the whole week never overwrites a day already marked "eaten" in History.

## Production-style single-process run

```bash
cd client && npm run build
cd ../server && npm start
```

Express serves the built client from `client/dist` when it exists, so the whole app runs from
`node server/src/index.js` alone (no separate Vite dev server needed).

## Tests

```bash
cd server && npm test
```

Unit tests cover the weekly generation algorithm and the single-day refresh constraint logic.
