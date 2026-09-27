import db from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import { resolveOrCreateIngredientByName } from '../services/ingredientResolver.service.js';

// The weekly generator (planGenerator.service.js) requires coverage of exactly these
// 7 core types + 'free'. Users can add other meal_type values via the Manage page
// (same free-text tag pattern as cuisine) — they're valid catalog tags, but meals
// tagged with a type outside this set won't be picked for the mandatory weekly slots.
const DEFAULT_MEAL_TYPES = ['salad', 'rice', 'roti', 'pasta', 'noodle', 'soup', 'grain', 'free'];

function nonEmptyStrings(arr) {
  return (arr || []).filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim());
}

function validateMealInput(body, { partial = false } = {}) {
  const { name, types, cuisines, ingredients, instructions, photo } = body;

  if (!partial || name !== undefined) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new ApiError(400, 'name is required');
    }
  }
  if (!partial || types !== undefined) {
    if (!Array.isArray(types) || nonEmptyStrings(types).length === 0) {
      throw new ApiError(400, 'At least one meal type is required');
    }
  }
  if (!partial || cuisines !== undefined) {
    if (!Array.isArray(cuisines) || nonEmptyStrings(cuisines).length === 0) {
      throw new ApiError(400, 'At least one cuisine is required');
    }
  }
  if (ingredients !== undefined) {
    if (!Array.isArray(ingredients)) {
      throw new ApiError(400, 'ingredients must be an array');
    }
    for (const row of ingredients) {
      const hasId = row.ingredient_id !== undefined && row.ingredient_id !== null;
      const hasName = typeof row.ingredient_name === 'string' && row.ingredient_name.trim();
      if (hasId && hasName) {
        throw new ApiError(400, 'Provide only one of ingredient_id or ingredient_name per ingredient row');
      }
      if (!hasId && !hasName) {
        throw new ApiError(400, 'Each ingredient row needs an ingredient_id or ingredient_name');
      }
      if (row.quantity !== undefined && row.quantity !== null && Number(row.quantity) < 0) {
        throw new ApiError(400, 'quantity cannot be negative');
      }
    }
  }
  if (instructions !== undefined) {
    if (!Array.isArray(instructions)) {
      throw new ApiError(400, 'instructions must be an array');
    }
  }
  if (photo !== undefined && photo !== null) {
    if (typeof photo !== 'string' || !photo.startsWith('data:image/')) {
      throw new ApiError(400, 'photo must be an image data URL');
    }
    if (photo.length > 8_000_000) {
      throw new ApiError(400, 'Photo is too large (max ~5MB)');
    }
  }
}

function withTags(meal) {
  const types = db
    .prepare('SELECT type FROM meal_types WHERE meal_id = ? ORDER BY type')
    .all(meal.id)
    .map((r) => r.type);
  const cuisines = db
    .prepare('SELECT cuisine FROM meal_cuisines WHERE meal_id = ? ORDER BY cuisine')
    .all(meal.id)
    .map((r) => r.cuisine);
  return { ...meal, types, cuisines };
}

function withInstructions(meal) {
  const instructions = db
    .prepare('SELECT instruction FROM meal_instructions WHERE meal_id = ? ORDER BY step')
    .all(meal.id)
    .map((r) => r.instruction);
  return { ...meal, instructions };
}

function withIngredients(meal) {
  const links = db
    .prepare(
      `SELECT mi.ingredient_id, i.name, i.default_unit, mi.quantity, mi.unit
       FROM meal_ingredients mi
       JOIN ingredients i ON i.id = mi.ingredient_id
       WHERE mi.meal_id = ?`
    )
    .all(meal.id);
  return { ...meal, ingredients: links };
}

function replaceMealTypes(mealId, types) {
  db.prepare('DELETE FROM meal_types WHERE meal_id = ?').run(mealId);
  const insert = db.prepare('INSERT OR IGNORE INTO meal_types (meal_id, type) VALUES (?, ?)');
  for (const type of nonEmptyStrings(types)) insert.run(mealId, type);
}

function replaceMealCuisines(mealId, cuisines) {
  db.prepare('DELETE FROM meal_cuisines WHERE meal_id = ?').run(mealId);
  const insert = db.prepare('INSERT OR IGNORE INTO meal_cuisines (meal_id, cuisine) VALUES (?, ?)');
  for (const cuisine of nonEmptyStrings(cuisines)) insert.run(mealId, cuisine);
}

function replaceMealIngredients(mealId, ingredients) {
  db.prepare('DELETE FROM meal_ingredients WHERE meal_id = ?').run(mealId);
  const insert = db.prepare(
    'INSERT OR IGNORE INTO meal_ingredients (meal_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)'
  );
  const checkExists = db.prepare('SELECT id FROM ingredients WHERE id = ?');
  // Optional per-row tags (e.g. chicken/tofu from an imported recipe) are
  // added to the catalog ingredient — additive only, never removes tags.
  const insertTag = db.prepare('INSERT OR IGNORE INTO ingredient_tags (ingredient_id, tag) VALUES (?, ?)');

  for (const row of ingredients || []) {
    let ingredientId = row.ingredient_id;
    if (ingredientId) {
      if (!checkExists.get(ingredientId)) {
        throw new ApiError(404, `Ingredient ${ingredientId} not found`);
      }
    } else {
      ingredientId = resolveOrCreateIngredientByName(row.ingredient_name, row.unit);
    }
    insert.run(mealId, ingredientId, row.quantity ?? null, row.unit ?? null);
    if (Array.isArray(row.tags)) {
      for (const tag of nonEmptyStrings(row.tags)) insertTag.run(ingredientId, tag);
    }
  }
}

function replaceMealInstructions(mealId, instructions) {
  db.prepare('DELETE FROM meal_instructions WHERE meal_id = ?').run(mealId);
  const insert = db.prepare('INSERT INTO meal_instructions (meal_id, step, instruction) VALUES (?, ?, ?)');
  nonEmptyStrings(instructions).forEach((instruction, index) => {
    insert.run(mealId, index + 1, instruction);
  });
}

export function listMeals(req, res) {
  const { meal_type, cuisine, ingredient_tag, active } = req.query;
  const joins = [];
  const conditions = ['1=1'];
  const params = [];

  if (meal_type) {
    joins.push('JOIN meal_types mt ON mt.meal_id = m.id');
    conditions.push('mt.type = ?');
    params.push(meal_type);
  }
  if (cuisine) {
    joins.push('JOIN meal_cuisines mc ON mc.meal_id = m.id');
    conditions.push('mc.cuisine = ?');
    params.push(cuisine);
  }
  if (ingredient_tag) {
    joins.push('JOIN meal_ingredients mi ON mi.meal_id = m.id');
    joins.push('JOIN ingredient_tags it ON it.ingredient_id = mi.ingredient_id');
    conditions.push('it.tag = ?');
    params.push(ingredient_tag);
  }
  if (active !== undefined) {
    conditions.push('m.is_active = ?');
    params.push(active === '1' || active === 'true' ? 1 : 0);
  }

  // Excludes m.photo: it can be a multi-MB data URL and the manage table only
  // needs it on the single-meal profile page (getMeal), not for every row here.
  const query = `SELECT DISTINCT m.id, m.name, m.description, m.notes, m.is_active, m.created_at, m.updated_at
    FROM meals m ${joins.join(' ')} WHERE ${conditions.join(' AND ')} ORDER BY m.name`;
  const meals = db.prepare(query).all(...params).map(withTags);
  res.json(meals);
}

export function getMeal(req, res) {
  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(req.params.id);
  if (!meal) throw new ApiError(404, 'Meal not found');
  res.json(withInstructions(withIngredients(withTags(meal))));
}

export function createMeal(req, res) {
  validateMealInput(req.body);
  const {
    name,
    description = null,
    notes = null,
    photo = null,
    types,
    cuisines,
    ingredients = [],
    instructions = [],
  } = req.body;

  const tx = db.transaction(() => {
    const result = db
      .prepare('INSERT INTO meals (name, description, notes, photo) VALUES (?, ?, ?, ?)')
      .run(name.trim(), description, notes, photo);
    const mealId = result.lastInsertRowid;
    replaceMealTypes(mealId, types);
    replaceMealCuisines(mealId, cuisines);
    replaceMealIngredients(mealId, ingredients);
    replaceMealInstructions(mealId, instructions);
    return mealId;
  });

  const mealId = tx();
  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(mealId);
  res.status(201).json(withInstructions(withIngredients(withTags(meal))));
}

export function updateMeal(req, res) {
  const existing = db.prepare('SELECT * FROM meals WHERE id = ?').get(req.params.id);
  if (!existing) throw new ApiError(404, 'Meal not found');
  validateMealInput(req.body, { partial: true });

  const { name, description, notes, photo, types, cuisines, ingredients, instructions, is_active } = req.body;

  const tx = db.transaction(() => {
    const fields = [];
    const values = [];
    if (name !== undefined) {
      fields.push('name = ?');
      values.push(name.trim());
    }
    if (description !== undefined) {
      fields.push('description = ?');
      values.push(description);
    }
    if (notes !== undefined) {
      fields.push('notes = ?');
      values.push(notes);
    }
    if (photo !== undefined) {
      fields.push('photo = ?');
      values.push(photo);
    }
    if (is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(is_active);
    }
    if (fields.length) {
      db.prepare(`UPDATE meals SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(
        ...values,
        req.params.id
      );
    }
    if (types !== undefined) replaceMealTypes(req.params.id, types);
    if (cuisines !== undefined) replaceMealCuisines(req.params.id, cuisines);
    if (ingredients !== undefined) replaceMealIngredients(req.params.id, ingredients);
    if (instructions !== undefined) replaceMealInstructions(req.params.id, instructions);
  });
  tx();

  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(req.params.id);
  res.json(withInstructions(withIngredients(withTags(meal))));
}

export function deleteMeal(req, res) {
  const existing = db.prepare('SELECT * FROM meals WHERE id = ?').get(req.params.id);
  if (!existing) throw new ApiError(404, 'Meal not found');
  const referenced = db
    .prepare('SELECT COUNT(*) as count FROM meal_history WHERE meal_id = ?')
    .get(req.params.id);
  if (referenced.count > 0) {
    db.prepare(`UPDATE meals SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(
      req.params.id
    );
    return res.json({ softDeleted: true });
  }
  db.prepare('DELETE FROM meals WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
}

export function listCuisines(req, res) {
  const rows = db.prepare('SELECT DISTINCT cuisine FROM meal_cuisines ORDER BY cuisine').all();
  res.json(rows.map((r) => r.cuisine));
}

export function listMealTypes(req, res) {
  const rows = db.prepare('SELECT DISTINCT type FROM meal_types').all();
  const values = new Set([...DEFAULT_MEAL_TYPES, ...rows.map((r) => r.type)]);
  res.json([...values].sort());
}
