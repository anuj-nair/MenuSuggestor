import db from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';

function nonEmptyStrings(arr) {
  return (arr || []).filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim());
}

function withTags(ingredient) {
  const tags = db
    .prepare('SELECT tag FROM ingredient_tags WHERE ingredient_id = ? ORDER BY tag')
    .all(ingredient.id)
    .map((r) => r.tag);
  return { ...ingredient, tags };
}

function replaceIngredientTags(ingredientId, tags) {
  db.prepare('DELETE FROM ingredient_tags WHERE ingredient_id = ?').run(ingredientId);
  const insert = db.prepare('INSERT OR IGNORE INTO ingredient_tags (ingredient_id, tag) VALUES (?, ?)');
  for (const tag of nonEmptyStrings(tags)) insert.run(ingredientId, tag);
}

export function listIngredients(req, res) {
  const rows = db.prepare('SELECT * FROM ingredients ORDER BY name').all();
  res.json(rows.map(withTags));
}

export function createIngredient(req, res) {
  const { name, default_unit, tags = [] } = req.body;
  if (!name || !name.trim()) throw new ApiError(400, 'name is required');
  if (!default_unit || !default_unit.trim()) throw new ApiError(400, 'default_unit is required');

  const existing = db
    .prepare('SELECT id FROM ingredients WHERE LOWER(name) = LOWER(?) AND LOWER(default_unit) = LOWER(?)')
    .get(name.trim(), default_unit.trim());
  if (existing) {
    throw new ApiError(409, 'An ingredient with this name and unit already exists');
  }

  const tx = db.transaction(() => {
    const result = db
      .prepare('INSERT INTO ingredients (name, default_unit) VALUES (?, ?)')
      .run(name.trim(), default_unit.trim());
    replaceIngredientTags(result.lastInsertRowid, tags);
    return result.lastInsertRowid;
  });

  const id = tx();
  const row = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(id);
  res.status(201).json(withTags(row));
}

// Re-points every meal_ingredients row from sourceId to targetId, dropping the
// source's link where the meal is already linked to targetId (no duplicate links),
// unions tags onto the target, and removes the now-redundant source ingredient.
function mergeIngredientInto(sourceId, targetId) {
  const links = db.prepare('SELECT * FROM meal_ingredients WHERE ingredient_id = ?').all(sourceId);
  for (const link of links) {
    const targetLink = db
      .prepare('SELECT id FROM meal_ingredients WHERE meal_id = ? AND ingredient_id = ?')
      .get(link.meal_id, targetId);
    if (targetLink) {
      db.prepare('DELETE FROM meal_ingredients WHERE id = ?').run(link.id);
    } else {
      db.prepare('UPDATE meal_ingredients SET ingredient_id = ? WHERE id = ?').run(targetId, link.id);
    }
  }

  const sourceTags = db.prepare('SELECT tag FROM ingredient_tags WHERE ingredient_id = ?').all(sourceId);
  const insertTag = db.prepare('INSERT OR IGNORE INTO ingredient_tags (ingredient_id, tag) VALUES (?, ?)');
  for (const { tag } of sourceTags) insertTag.run(targetId, tag);

  db.prepare('DELETE FROM ingredients WHERE id = ?').run(sourceId);
}

export function updateIngredient(req, res) {
  const existing = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(req.params.id);
  if (!existing) throw new ApiError(404, 'Ingredient not found');
  const { name, default_unit, tags } = req.body;

  // Identity is (name, default_unit), not name alone: "Garlic" by the clove and
  // "Garlic" by the head are different catalog items and may coexist. Only an
  // edit that lands on the exact same name AND unit as another ingredient is a
  // real duplicate.
  const resultingName = name && name.trim() ? name.trim() : existing.name;
  const resultingUnit = default_unit && default_unit.trim() ? default_unit.trim() : existing.default_unit;

  const conflict = db
    .prepare(
      'SELECT * FROM ingredients WHERE LOWER(name) = LOWER(?) AND LOWER(default_unit) = LOWER(?) AND id != ?'
    )
    .get(resultingName, resultingUnit, req.params.id);

  if (conflict) {
    // The edit turned this ingredient into a duplicate of an existing one
    // (e.g. "garlic"/clove -> "Garlic"/clove). Merge into the existing
    // ingredient instead of blocking the edit.
    const targetId = conflict.id;
    const tx = db.transaction(() => {
      db.prepare('UPDATE ingredients SET name = ?, default_unit = ? WHERE id = ?').run(
        resultingName,
        resultingUnit,
        targetId
      );
      if (tags !== undefined) {
        const insertTag = db.prepare('INSERT OR IGNORE INTO ingredient_tags (ingredient_id, tag) VALUES (?, ?)');
        for (const tag of nonEmptyStrings(tags)) insertTag.run(targetId, tag);
      }
      mergeIngredientInto(existing.id, targetId);
    });
    tx();

    const row = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(targetId);
    return res.json({ ...withTags(row), merged: true, mergedFromId: existing.id });
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE ingredients SET name = ?, default_unit = ? WHERE id = ?').run(
      resultingName,
      resultingUnit,
      req.params.id
    );
    if (tags !== undefined) replaceIngredientTags(req.params.id, tags);
  });
  tx();

  const row = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(req.params.id);
  res.json(withTags(row));
}

const DEFAULT_UNITS = ['g', 'kg', 'ml', 'l', 'cup', 'tbsp', 'tsp', 'piece', 'clove', 'pinch'];

export function listUnits(req, res) {
  const fromIngredients = db.prepare('SELECT DISTINCT default_unit as unit FROM ingredients').all();
  const fromLinks = db
    .prepare("SELECT DISTINCT unit FROM meal_ingredients WHERE unit IS NOT NULL AND unit != ''")
    .all();
  const values = new Set([
    ...DEFAULT_UNITS,
    ...fromIngredients.map((r) => r.unit),
    ...fromLinks.map((r) => r.unit),
  ]);
  res.json([...values].sort());
}

const DEFAULT_INGREDIENT_TAGS = ['chicken', 'tofu', 'grain', 'vegetable', 'dairy'];

export function listIngredientTags(req, res) {
  const rows = db.prepare('SELECT DISTINCT tag FROM ingredient_tags ORDER BY tag').all();
  const values = new Set([...DEFAULT_INGREDIENT_TAGS, ...rows.map((r) => r.tag)]);
  res.json([...values].sort());
}
