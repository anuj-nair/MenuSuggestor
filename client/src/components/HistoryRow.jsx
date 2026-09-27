import { useState } from 'react';
import { formatDisplayDate } from '../utils/dateFormat.js';

const STATUSES = ['planned', 'eaten', 'skipped'];

export default function HistoryRow({ entry, meals, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [useFreeText, setUseFreeText] = useState(!entry.meal && !!entry.free_text_name);
  const [mealId, setMealId] = useState(entry.meal?.id || '');
  const [freeText, setFreeText] = useState(entry.free_text_name || '');
  const [status, setStatus] = useState(entry.status || 'eaten');
  const [notes, setNotes] = useState(entry.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(entry.date, {
        meal_id: useFreeText ? null : mealId ? Number(mealId) : null,
        free_text_name: useFreeText ? freeText.trim() || null : null,
        status,
        notes: notes.trim() || null,
      });
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <tr>
        <td>{formatDisplayDate(entry.date)}</td>
        <td>{entry.meal_type || '—'}</td>
        <td>{entry.meal?.name || entry.free_text_name || '—'}</td>
        <td>
          <span className={`badge badge-status badge-status-${entry.status}`}>{entry.status}</span>
        </td>
        <td>{entry.notes || ''}</td>
        <td className="row-actions">
          <button className="btn btn-text btn-small" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button className="btn btn-text btn-small btn-danger-text" onClick={() => onDelete(entry.date)}>
            Delete
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="row-editing">
      <td colSpan={6}>
        <div className="history-edit-form">
          {error && <p className="field-error">{error}</p>}
          <div className="history-edit-row">
            <label>
              <input type="radio" checked={!useFreeText} onChange={() => setUseFreeText(false)} />
              Catalog meal
            </label>
            <select value={mealId} onChange={(e) => setMealId(e.target.value)} disabled={useFreeText}>
              <option value="">Select meal...</option>
              {(meals || []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({(m.types || []).join(', ') || 'no type'})
                </option>
              ))}
            </select>
          </div>
          <div className="history-edit-row">
            <label>
              <input type="radio" checked={useFreeText} onChange={() => setUseFreeText(true)} />
              Free text
            </label>
            <input
              type="text"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              disabled={!useFreeText}
              placeholder="e.g. Leftovers, ate out..."
            />
          </div>
          <div className="history-edit-row">
            <label>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="history-edit-row">
            <label>
              Notes
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>
          <div className="form-actions">
            <button className="btn btn-secondary btn-small" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="btn btn-primary btn-small" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}
