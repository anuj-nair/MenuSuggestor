# API reference

All endpoints are mounted under `/api` by `server/src/index.js`. Requests and
responses are JSON. See [architecture.md](architecture.md) for the layered
routes → controllers → services structure these are implemented with.

## Meals

| Method | Path | Description |
|---|---|---|
| GET | `/api/meals` | List meals. Query filters: `meal_type`, `cuisine`, `ingredient_tag`, `active` (`0`/`1`). |
| GET | `/api/meals/:id` | Get one meal (with types, cuisines, ingredients, instructions). |
| POST | `/api/meals` | Create a meal. Body: `name`, `description?`, `notes?`, `photo?`, `types[]`, `cuisines[]`, `ingredients[]`, `instructions[]`. |
| PUT | `/api/meals/:id` | Update a meal (partial — omit fields to leave them unchanged). |
| DELETE | `/api/meals/:id` | Delete a meal. |
| GET | `/api/cuisines` | List distinct cuisines in use. |
| GET | `/api/meal-types` | List the core meal types. |

## Meal ↔ ingredient links

Nested under a meal (`server/src/routes/mealIngredients.routes.js`):

| Method | Path | Description |
|---|---|---|
| GET | `/api/meals/:mealId/ingredients` | List a meal's ingredients with quantity/unit. |
| POST | `/api/meals/:mealId/ingredients` | Link an ingredient. Body: `ingredient_id` **or** `ingredient_name` (resolved/created via `ingredientResolver.service.js`), plus `quantity?`, `unit?`. |
| PUT | `/api/meals/:mealId/ingredients/:ingredientId` | Update the link's `quantity`/`unit`. |
| DELETE | `/api/meals/:mealId/ingredients/:ingredientId` | Unlink an ingredient from the meal. |

## Ingredients catalog

| Method | Path | Description |
|---|---|---|
| GET | `/api/ingredients` | List the ingredient catalog. |
| POST | `/api/ingredients` | Create an ingredient. Body: `name`, `default_unit`, `tags[]?` (e.g. `chicken`, `tofu`). |
| PUT | `/api/ingredients/:id` | Update an ingredient's name/unit/tags. |
| GET | `/api/ingredients/units` | List distinct units in use (for form autocomplete). |
| GET | `/api/ingredients/tags` | List distinct ingredient tags in use. |

## Weekly plan

| Method | Path | Description |
|---|---|---|
| GET | `/api/plan` | Get the plan starting at `?start=` (default: today), 7 days. |
| POST | `/api/plan/generate` | Generate/regenerate the week. Body: `start_date?`, `include_free_day?` (bool). Never overwrites a day already marked `eaten` in History. |
| POST | `/api/plan/:date/refresh` | Re-pick a single day within its existing meal type. Body: `force?` (bool) — bypasses the chicken/tofu preservation check (see [architecture.md](architecture.md#weekly-plan-generation)). |

## History

| Method | Path | Description |
|---|---|---|
| GET | `/api/history` | List history entries between `?from=` and `?to=` (ISO dates; defaults to all-time through today). |
| PUT | `/api/history/:date` | Create/update the entry for a date. Body: `meal_id?`, `free_text_name?`, `status?` (`planned`/`eaten`/`skipped`, default `eaten`), `notes?`, `meal_type`. |
| DELETE | `/api/history/:date` | Delete the entry for a date. |

## Recipe import

| Method | Path | Description |
|---|---|---|
| POST | `/api/recipes/extract` | Run the `recipe_ingestion` subprocess. Body: `{ source: 'url', url }` or `{ source: 'text', text, reference? }`. Returns the structured `RecipeRecord` JSON for the client to pre-fill a meal form with — nothing is saved to the DB by this call. See [architecture.md](architecture.md#recipe-import-paste-text--link--pre-filled-form). |

Error responses (from `middleware/errorHandler.js`) are
`{ "error": "<message>", "code"?: "<CODE>" }` with an appropriate HTTP status.
`/api/recipes/extract` uses a few specific codes worth handling in a client:
`NOT_CONFIGURED` (503), `SCRAPE_BLOCKED` (422), `TEXT_TOO_SHORT` (422),
`LLM_UNAVAILABLE` (503), `EXTRACTION_FAILED` (502), `TIMEOUT` (502).

## Misc

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Liveness check — `{ ok: true }`. |
