# Running the application

Assumes you've completed [setup.md](setup.md). See [architecture.md](architecture.md)
for why dev is two processes and prod is one.

## Development mode (two processes)

```bash
npm run dev
```

Starts, together (via `concurrently`):

- Express API on `http://localhost:4000`
- Vite dev server on `http://localhost:5173`, proxying `/api/*` to Express
  (see `client/vite.config.js`)

Open `http://localhost:5173` — this is the URL to use during development
(not :4000). Both processes support hot reload (`nodemon` for the server,
Vite HMR for the client).

To run just one side:

```bash
npm run dev --prefix server    # API only, :4000
npm run dev --prefix client    # SPA only, :5173 (needs the API running to proxy to)
```

## Production-style single-process run

```bash
cd client && npm run build
cd ../server && npm start
```

Express serves the built client from `client/dist` when it exists (see
`server/src/index.js`), with a catch-all route falling back to
`index.html` for SPA routing on any non-`/api` path. The whole app runs from
`node server/src/index.js` alone on port 4000 — no separate client process.

Rebuild (`npm run build` in `client/`) any time client source changes; the
server doesn't watch or rebuild it automatically.

## Tests

```bash
cd server && npm test
```

Runs Node's built-in test runner (`node --test tests/*.test.js`) over
`server/tests/planGenerator.test.js` — unit tests for the weekly generation
algorithm and the single-day refresh constraint logic (see
[architecture.md](architecture.md#weekly-plan-generation)).

Recipe ingestion has its own test suite (Python/pytest), independent of the
Node app:

```bash
cd recipe_ingestion && source .venv/bin/activate && pytest
```

## Useful CLI commands

Run from the repo root unless noted:

| Command | Does |
|---|---|
| `npm run server:migrate` | (Re-)create the SQLite schema |
| `npm run server:seed` | Insert the starter meal/ingredient catalog |
| `npm run recipes` | Interactive CLI to import `recipe_ingestion` output JSON files into the DB |
| `cd server && npm run recipes:import` | Non-interactive variant of the above |
| `cd server && npm run recipes:clear` | Delete all meals (confirmation required; see its `--yes` flag for scripting) |

Recipe import tool itself (run from `recipe_ingestion/`, venv activated):

```bash
recipe-ingest ingest-website "https://example.com/some-recipe/"
recipe-ingest ingest-text recipe.txt          # or: pbpaste | recipe-ingest ingest-text
recipe-ingest list
recipe-ingest show <id-or-prefix>
```

Each run writes `recipe_ingestion/output/recipes/<uuid>.json`; see
[recipe_ingestion/README.md](../recipe_ingestion/README.md#mapping-to-the-product-db-serversrcdbschemasql)
for how those fields map onto the app's DB schema.
