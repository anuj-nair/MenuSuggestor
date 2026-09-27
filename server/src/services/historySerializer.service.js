import db from '../db/index.js';

function groupBy(rows, keyField, valField) {
  const map = {};
  for (const r of rows) {
    if (!map[r[keyField]]) map[r[keyField]] = [];
    map[r[keyField]].push(r[valField]);
  }
  return map;
}

// Batch-attaches each row's meal's cuisines and chicken/tofu protein tags
// (derived from linked ingredients) so history/plan views can still show
// cuisine + protein-balance info even though neither lives on `meals` directly.
export function attachMealCuisinesAndProteins(rows) {
  const mealIds = [...new Set(rows.map((r) => r.meal_id).filter(Boolean))];
  if (mealIds.length === 0) {
    return rows.map((r) => ({ ...r, meal_cuisines: [], meal_protein_tags: [] }));
  }

  const placeholders = mealIds.map(() => '?').join(',');
  const cuisineRows = db
    .prepare(`SELECT meal_id, cuisine FROM meal_cuisines WHERE meal_id IN (${placeholders})`)
    .all(...mealIds);
  const proteinRows = db
    .prepare(
      `SELECT DISTINCT mi.meal_id, LOWER(it.tag) as tag
       FROM meal_ingredients mi
       JOIN ingredient_tags it ON it.ingredient_id = mi.ingredient_id
       WHERE LOWER(it.tag) IN ('chicken', 'tofu') AND mi.meal_id IN (${placeholders})`
    )
    .all(...mealIds);

  const cuisinesByMeal = groupBy(cuisineRows, 'meal_id', 'cuisine');
  const proteinsByMeal = groupBy(proteinRows, 'meal_id', 'tag');

  return rows.map((r) => ({
    ...r,
    meal_cuisines: cuisinesByMeal[r.meal_id] || [],
    meal_protein_tags: proteinsByMeal[r.meal_id] || [],
  }));
}

export function serializeHistoryRow(row) {
  return {
    date: row.date,
    meal_type: row.meal_type,
    status: row.status,
    plan_batch_id: row.plan_batch_id ?? null,
    notes: row.notes,
    meal: row.meal_id
      ? {
          id: row.meal_id,
          name: row.meal_name,
          cuisines: row.meal_cuisines || [],
          protein_tags: row.meal_protein_tags || [],
          is_active: row.meal_is_active,
        }
      : null,
    free_text_name: row.free_text_name,
  };
}
