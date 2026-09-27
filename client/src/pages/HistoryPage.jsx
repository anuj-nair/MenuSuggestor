import { useState } from 'react';
import { useFetch } from '../hooks/useFetch.js';
import { getHistory, upsertHistoryEntry, deleteHistoryEntry } from '../api/history.api.js';
import { getMeals } from '../api/meals.api.js';
import HistoryRow from '../components/HistoryRow.jsx';
import Banner from '../components/Banner.jsx';
import { isoToday } from '../utils/dateFormat.js';

function defaultFromDate() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export default function HistoryPage() {
  const [from, setFrom] = useState(defaultFromDate());
  const [to, setTo] = useState(isoToday());
  const { data: history, loading, error, refetch } = useFetch(() => getHistory(from, to), [from, to]);
  const { data: meals } = useFetch(() => getMeals({ active: 1 }), []);
  const [banner, setBanner] = useState(null);
  const [newDate, setNewDate] = useState(isoToday());

  const handleSave = async (date, data) => {
    await upsertHistoryEntry(date, data);
    refetch();
  };

  const handleDelete = async (date) => {
    try {
      await deleteHistoryEntry(date);
      refetch();
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    }
  };

  const handleAddEntry = async () => {
    try {
      await upsertHistoryEntry(newDate, { free_text_name: 'New entry', status: 'eaten' });
      refetch();
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="page">
      <h1>Meal History</h1>
      <p className="page-subtitle">View and edit what you actually ate — past or planned entries can be changed anytime.</p>

      <div className="manager-toolbar">
        <label>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      <div className="manager-toolbar">
        <label>
          New entry date
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
        </label>
        <button className="btn btn-primary" onClick={handleAddEntry}>
          + Add Entry
        </button>
      </div>

      <Banner type={banner?.type} onDismiss={() => setBanner(null)}>
        {banner?.text}
      </Banner>

      {loading && <p>Loading history...</p>}
      {error && <Banner type="error">{error.message}</Banner>}

      {history && (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Meal</th>
                <th>Status</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <HistoryRow
                  key={entry.date}
                  entry={entry}
                  meals={meals}
                  onSave={handleSave}
                  onDelete={handleDelete}
                />
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    No history entries in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
