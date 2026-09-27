import db from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import { generateWeek, refreshDay } from '../services/planGenerator.service.js';
import { nextNDates, generateBatchId, todayISO } from '../utils/dateUtils.js';
import { attachMealCuisinesAndProteins, serializeHistoryRow } from '../services/historySerializer.service.js';

// Builds the enriched meal shape the generator needs: types[] (from
// meal_types) and proteinTags (a Set of chicken/tofu tags derived from
// linked ingredients' tags) instead of the old flat meal_type/protein columns.
function getActiveMeals() {
  const meals = db.prepare('SELECT id, name, notes, is_active FROM meals WHERE is_active = 1').all();

  const typeRows = db.prepare('SELECT meal_id, type FROM meal_types').all();
  const proteinRows = db
    .prepare(
      `SELECT DISTINCT mi.meal_id, LOWER(it.tag) as tag
       FROM meal_ingredients mi
       JOIN ingredient_tags it ON it.ingredient_id = mi.ingredient_id
       WHERE LOWER(it.tag) IN ('chicken', 'tofu')`
    )
    .all();

  const typesByMeal = {};
  for (const r of typeRows) {
    (typesByMeal[r.meal_id] ??= []).push(r.type);
  }
  const proteinsByMeal = {};
  for (const r of proteinRows) {
    (proteinsByMeal[r.meal_id] ??= []).push(r.tag);
  }

  return meals.map((m) => ({
    ...m,
    types: typesByMeal[m.id] || [],
    proteinTags: new Set(proteinsByMeal[m.id] || []),
  }));
}

function getHistoryRowsForDates(dates) {
  const placeholders = dates.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT h.*, m.name as meal_name, m.is_active as meal_is_active
       FROM meal_history h
       LEFT JOIN meals m ON m.id = h.meal_id
       WHERE h.date IN (${placeholders})
       ORDER BY h.date`
    )
    .all(...dates);
  return attachMealCuisinesAndProteins(rows);
}

export function getPlan(req, res) {
  const start = req.query.start || todayISO();
  const dates = nextNDates(start, 7);
  const rows = getHistoryRowsForDates(dates);
  const byDate = Object.fromEntries(rows.map((r) => [r.date, r]));
  const days = dates.map((date) =>
    byDate[date]
      ? serializeHistoryRow(byDate[date])
      : { date, meal_type: null, status: null, meal: null, free_text_name: null, plan_batch_id: null, notes: null }
  );
  res.json({ days });
}

export function generatePlan(req, res) {
  const { start_date, include_free_day = false } = req.body;
  const dates = nextNDates(start_date || todayISO(), 7);
  const meals = getActiveMeals();
  if (meals.length === 0) {
    throw new ApiError(409, 'No recipes yet — add some meals on the Manage page before generating a week.', {
      code: 'NO_MEALS',
    });
  }

  const { days, warnings } = generateWeek({ meals, dates, includeFreeDay: include_free_day });

  const existingRows = getHistoryRowsForDates(dates);
  const eatenDates = new Set(existingRows.filter((r) => r.status === 'eaten').map((r) => r.date));
  const skippedDates = [...eatenDates];

  const batchId = generateBatchId();

  const tx = db.transaction(() => {
    const upsertStmt = db.prepare(
      `INSERT INTO meal_history (date, meal_type, meal_id, status, plan_batch_id)
       VALUES (?, ?, ?, 'planned', ?)
       ON CONFLICT(date) DO UPDATE SET
         meal_type = excluded.meal_type,
         meal_id = excluded.meal_id,
         status = 'planned',
         plan_batch_id = excluded.plan_batch_id,
         free_text_name = NULL,
         updated_at = datetime('now')`
    );

    for (const day of days) {
      if (eatenDates.has(day.date)) continue;
      upsertStmt.run(day.date, day.meal_type, day.meal ? day.meal.id : null, batchId);
    }
  });
  tx();

  const rows = getHistoryRowsForDates(dates);
  const byDate = Object.fromEntries(rows.map((r) => [r.date, r]));
  const resultDays = dates.map((date) => serializeHistoryRow(byDate[date]));

  res.json({ days: resultDays, warnings, skipped_dates: skippedDates });
}

export function refreshDayHandler(req, res) {
  const { date } = req.params;
  const force = req.body?.force === true;

  const existing = db.prepare('SELECT * FROM meal_history WHERE date = ?').get(date);
  if (!existing) throw new ApiError(404, 'No plan entry for this date. Generate a week first.');
  if (existing.status === 'eaten') {
    throw new ApiError(409, 'Cannot refresh a day already logged as eaten — edit history instead.');
  }

  const batchId = existing.plan_batch_id;
  const weekRows = batchId
    ? db.prepare('SELECT * FROM meal_history WHERE plan_batch_id = ?').all(batchId)
    : [existing];

  const meals = getActiveMeals();
  const mealsById = Object.fromEntries(meals.map((m) => [m.id, m]));

  const toDay = (row) => ({
    date: row.date,
    meal_type: row.meal_type,
    meal: row.meal_id ? mealsById[row.meal_id] : null,
  });

  const targetDay = toDay(existing);
  const otherDays = weekRows.filter((r) => r.date !== date).map(toDay);

  const { day, warning } = refreshDay({ meals, targetDay, otherDays, force });

  if (day.meal && day.meal.id !== existing.meal_id) {
    db.prepare(
      `UPDATE meal_history SET meal_id = ?, free_text_name = NULL, updated_at = datetime('now') WHERE date = ?`
    ).run(day.meal.id, date);
  }

  const [updated] = getHistoryRowsForDates([date]);
  res.json({ day: serializeHistoryRow(updated), warning });
}
