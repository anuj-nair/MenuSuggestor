import db from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import { resolveOrCreateIngredientByName } from '../services/ingredientResolver.service.js';

export function listMealIngredients(req, res) {
  const rows = db
    .prepare(
      `SELECT mi.id, mi.ingredient_id, i.name, i.default_unit, mi.quantity, mi.unit
       FROM meal_ingredients mi
       JOIN ingredients i ON i.id = mi.ingredient_id
       WHERE mi.meal_id = ?
       ORDER BY i.name`
    )
    .all(req.params.mealId);
  res.json(rows);
}

function assertNonNegativeQuantity(quantity) {
  if (quantity !== null && quantity !== undefined && Number(quantity) < 0) {
    throw new ApiError(400, 'quantity cannot be negative');
  }
}

export function linkIngredient(req, res) {
  const { ingredient_id, ingredient_name, quantity = null, unit = null } = req.body;
  assertNonNegativeQuantity(quantity);

  const meal = db.prepare('SELECT id FROM meals WHERE id = ?').get(req.params.mealId);
  if (!meal) throw new ApiError(404, 'Meal not found');

  let resolvedIngredientId = ingredient_id;
  if (resolvedIngredientId) {
    const ingredient = db.prepare('SELECT id FROM ingredients WHERE id = ?').get(resolvedIngredientId);
    if (!ingredient) throw new ApiError(404, 'Ingredient not found');
  } else {
    if (!ingredient_name || !ingredient_name.trim()) {
      throw new ApiError(400, 'ingredient_id or ingredient_name is required');
    }
    resolvedIngredientId = resolveOrCreateIngredientByName(ingredient_name, unit);
  }

  try {
    const result = db
      .prepare(
        'INSERT INTO meal_ingredients (meal_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)'
      )
      .run(req.params.mealId, resolvedIngredientId, quantity, unit);
    res.status(201).json({ id: result.lastInsertRowid, ingredient_id: resolvedIngredientId });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      throw new ApiError(409, 'This ingredient is already linked to this meal');
    }
    throw err;
  }
}

export function updateLink(req, res) {
  const { quantity, unit } = req.body;
  assertNonNegativeQuantity(quantity);
  const existing = db
    .prepare('SELECT * FROM meal_ingredients WHERE meal_id = ? AND ingredient_id = ?')
    .get(req.params.mealId, req.params.ingredientId);
  if (!existing) throw new ApiError(404, 'Link not found');
  db.prepare(
    'UPDATE meal_ingredients SET quantity = ?, unit = ? WHERE meal_id = ? AND ingredient_id = ?'
  ).run(quantity ?? existing.quantity, unit ?? existing.unit, req.params.mealId, req.params.ingredientId);
  res.json({ updated: true });
}

export function unlinkIngredient(req, res) {
  const result = db
    .prepare('DELETE FROM meal_ingredients WHERE meal_id = ? AND ingredient_id = ?')
    .run(req.params.mealId, req.params.ingredientId);
  if (result.changes === 0) throw new ApiError(404, 'Link not found');
  res.json({ deleted: true });
}
