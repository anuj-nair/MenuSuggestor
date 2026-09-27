import db from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import { todayISO } from '../utils/dateUtils.js';
import { attachMealCuisinesAndProteins, serializeHistoryRow } from '../services/historySerializer.service.js';

export function listHistory(req, res) {
  const from = req.query.from || '0000-01-01';
  const to = req.query.to || todayISO();
  const rows = db
    .prepare(
      `SELECT h.*, m.name as meal_name, m.is_active as meal_is_active
       FROM meal_history h
       LEFT JOIN meals m ON m.id = h.meal_id
       WHERE h.date BETWEEN ? AND ?
       ORDER BY h.date DESC`
    )
    .all(from, to);
  res.json(attachMealCuisinesAndProteins(rows).map(serializeHistoryRow));
}

const VALID_STATUSES = ['planned', 'eaten', 'skipped'];

export function upsertHistoryEntry(req, res) {
  const { date } = req.params;
  const { meal_id = null, free_text_name = null, status = 'eaten', notes = null, meal_type } = req.body;

  if (!meal_id && !free_text_name) {
    throw new ApiError(400, 'Either meal_id or free_text_name is required');
  }
  if (meal_id && free_text_name) {
    throw new ApiError(400, 'Provide only one of meal_id or free_text_name, not both');
  }
  if (!VALID_STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  if (meal_id) {
    const meal = db.prepare('SELECT id FROM meals WHERE id = ?').get(meal_id);
    if (!meal) throw new ApiError(404, 'Meal not found');
  }

  const existing = db.prepare('SELECT * FROM meal_history WHERE date = ?').get(date);

  // A meal can have 0-many types now, so there's no single correct type to
  // auto-derive from it. Prefer the existing row's own type (editing a
  // planned/eaten day shouldn't change which slot it represents); only
  // require an explicit meal_type when there's no prior row to inherit from.
  let resolvedType = (meal_type || existing?.meal_type || '').trim();
  if (!resolvedType) {
    if (meal_id) {
      throw new ApiError(
        400,
        'meal_type is required when logging a catalog meal with no existing plan entry for this date'
      );
    }
    resolvedType = 'free';
  }

  if (existing) {
    db.prepare(
      `UPDATE meal_history SET meal_id = ?, free_text_name = ?, status = ?, notes = ?, meal_type = ?, updated_at = datetime('now')
       WHERE date = ?`
    ).run(meal_id, free_text_name, status, notes, resolvedType, date);
  } else {
    db.prepare(
      `INSERT INTO meal_history (date, meal_type, meal_id, free_text_name, status, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(date, resolvedType, meal_id, free_text_name, status, notes);
  }

  const row = db
    .prepare(
      `SELECT h.*, m.name as meal_name, m.is_active as meal_is_active
       FROM meal_history h
       LEFT JOIN meals m ON m.id = h.meal_id
       WHERE h.date = ?`
    )
    .get(date);
  const [enriched] = attachMealCuisinesAndProteins([row]);
  res.json(serializeHistoryRow(enriched));
}

export function deleteHistoryEntry(req, res) {
  const result = db.prepare('DELETE FROM meal_history WHERE date = ?').run(req.params.date);
  if (result.changes === 0) throw new ApiError(404, 'No history entry for this date');
  res.json({ deleted: true });
}
