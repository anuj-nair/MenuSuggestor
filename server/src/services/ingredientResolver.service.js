import db from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';

// Finds an ingredient by case-insensitive name match, or creates one if none exists.
// Catalog identity is (name, default_unit), so the same name can have multiple
// catalog rows for genuinely different units (e.g. "Garlic" by the head vs. by
// the clove, added deliberately via the ingredients catalog page). But the `unit`
// passed in here is just this recipe's own measurement (stored separately on
// meal_ingredients) — a recipe calling for garlic "by the cup" doesn't need a
// matching catalog row, so a non-matching unit must never spawn a near-duplicate
// catalog entry here. When one catalog row already matches by name, reuse it
// (preferring an exact unit match if multiple rows share the name); only create
// a new catalog row when the name doesn't exist there at all yet.
export function resolveOrCreateIngredientByName(name, unit) {
  const trimmedName = name.trim();
  const trimmedUnit = unit && unit.trim() ? unit.trim() : null;

  const matches = db
    .prepare('SELECT id, default_unit FROM ingredients WHERE LOWER(name) = LOWER(?) ORDER BY id')
    .all(trimmedName);

  if (matches.length > 0) {
    if (trimmedUnit) {
      const exact = matches.find((m) => m.default_unit.toLowerCase() === trimmedUnit.toLowerCase());
      if (exact) return exact.id;
    }
    return matches[0].id;
  }

  if (!trimmedUnit) {
    throw new ApiError(
      400,
      `"${trimmedName}" isn't in your ingredient catalog yet — enter a unit so it can be added.`
    );
  }

  const created = db
    .prepare('INSERT INTO ingredients (name, default_unit) VALUES (?, ?)')
    .run(trimmedName, trimmedUnit);
  return created.lastInsertRowid;
}
