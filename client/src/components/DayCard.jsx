import { formatDisplayDate } from '../utils/dateFormat.js';

const TYPE_LABELS = {
  salad: 'Salad',
  rice: 'Rice',
  roti: 'Roti',
  pasta: 'Pasta',
  noodle: 'Noodle',
  soup: 'Soup',
  grain: 'Grain',
  free: 'Free Day',
};

const PROTEIN_LABELS = {
  chicken: 'Chicken',
  tofu: 'Tofu',
};

export default function DayCard({ day, onRefresh, refreshing, warning, onDismissWarning }) {
  const meal = day.meal;
  const title = meal ? meal.name : day.free_text_name || 'No meal planned';

  return (
    <div className="day-card">
      <div className="day-card-header">
        <span className="day-date">{formatDisplayDate(day.date)}</span>
        {day.meal_type && (
          <span className={`badge badge-type badge-type-${day.meal_type}`}>
            {TYPE_LABELS[day.meal_type] || day.meal_type}
          </span>
        )}
      </div>

      <h3 className="day-meal-name">{title}</h3>

      <div className="day-meta">
        {meal?.cuisines?.map((c) => (
          <span key={c} className="meta-item">
            {c}
          </span>
        ))}
        {meal?.protein_tags?.map(
          (p) => PROTEIN_LABELS[p] && (
            <span key={p} className="badge badge-protein">
              {PROTEIN_LABELS[p]}
            </span>
          )
        )}
        {day.status && day.status !== 'planned' && (
          <span className={`badge badge-status badge-status-${day.status}`}>{day.status}</span>
        )}
      </div>

      {warning && (
        <div className="day-warning">
          <p>{warning}</p>
          <button className="btn btn-small btn-secondary" onClick={() => onRefresh(day.date, true)}>
            Refresh anyway
          </button>
          <button className="btn btn-small btn-text" onClick={onDismissWarning}>
            Dismiss
          </button>
        </div>
      )}

      <button
        className="btn btn-secondary btn-small day-refresh-btn"
        onClick={() => onRefresh(day.date, false)}
        disabled={refreshing || day.status === 'eaten' || !day.meal_type}
      >
        {refreshing ? 'Refreshing...' : 'Refresh this day'}
      </button>
    </div>
  );
}
