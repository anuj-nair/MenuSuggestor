import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch.js';
import { getMeals, deleteMeal, updateMeal } from '../api/meals.api.js';
import { getIngredientTags } from '../api/ingredients.api.js';
import ConfirmDialog from './ConfirmDialog.jsx';
import Banner from './Banner.jsx';
import RowActionsMenu from './RowActionsMenu.jsx';
import AddMealDialog from './AddMealDialog.jsx';

export default function MealsManager() {
  const navigate = useNavigate();
  const location = useLocation();
  const [ingredientTagFilter, setIngredientTagFilter] = useState('');

  const { data: meals, loading, error, refetch } = useFetch(
    () => getMeals(ingredientTagFilter ? { ingredient_tag: ingredientTagFilter } : {}),
    [ingredientTagFilter]
  );
  const { data: ingredientTags } = useFetch(() => getIngredientTags(), []);

  const [pendingDelete, setPendingDelete] = useState(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [banner, setBanner] = useState(location.state?.banner ? { type: 'info', text: location.state.banner } : null);
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (location.state?.banner) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleDelete = async () => {
    try {
      const result = await deleteMeal(pendingDelete.id);
      setBanner({
        type: 'info',
        text: result.softDeleted
          ? `"${pendingDelete.name}" is referenced in history, so it was deactivated instead of deleted.`
          : `"${pendingDelete.name}" deleted.`,
      });
      refetch();
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    } finally {
      setPendingDelete(null);
    }
  };

  const handleToggleActive = async (meal) => {
    try {
      await updateMeal(meal.id, { is_active: meal.is_active ? 0 : 1 });
      refetch();
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    }
  };

  const searchLower = search.trim().toLowerCase();
  const filteredMeals = (meals || []).filter((m) => {
    if (typeFilter && !m.types.includes(typeFilter)) return false;
    if (searchLower) {
      const nameMatch = m.name.toLowerCase().includes(searchLower);
      const cuisineMatch = m.cuisines.some((c) => c.toLowerCase().includes(searchLower));
      if (!nameMatch && !cuisineMatch) return false;
    }
    return true;
  });
  const types = [...new Set((meals || []).flatMap((m) => m.types))].sort();

  return (
    <div>
      <div className="manager-toolbar">
        <input
          type="text"
          placeholder="Search by name or cuisine..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={ingredientTagFilter} onChange={(e) => setIngredientTagFilter(e.target.value)}>
          <option value="">All ingredient tags</option>
          {(ingredientTags || []).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={() => setAddDialogOpen(true)}>
          + Add Meal
        </button>
      </div>

      <Banner type={banner?.type} onDismiss={() => setBanner(null)}>
        {banner?.text}
      </Banner>

      {loading && <p>Loading meals...</p>}
      {error && <Banner type="error">{error.message}</Banner>}

      {meals && (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                <th>Name</th>
                <th>Type(s)</th>
                <th>Cuisine(s)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredMeals.map((m) => (
                <tr key={m.id} className={m.is_active ? '' : 'row-inactive'}>
                  <td className="status-cell">
                    <button
                      type="button"
                      className={`status-dot ${m.is_active ? 'status-dot-active' : 'status-dot-inactive'}`}
                      onClick={() => handleToggleActive(m)}
                      title={m.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                      aria-label={m.is_active ? 'Deactivate meal' : 'Activate meal'}
                    />
                  </td>
                  <td>
                    <button type="button" className="link-button" onClick={() => navigate(`/manage/meals/${m.id}`)}>
                      {m.name}
                    </button>
                  </td>
                  <td>
                    {m.types.map((t) => (
                      <span key={t} className="pill">
                        {t}
                      </span>
                    ))}
                  </td>
                  <td>
                    {m.cuisines.map((c) => (
                      <span key={c} className="pill">
                        {c}
                      </span>
                    ))}
                  </td>
                  <td className="row-actions">
                    <RowActionsMenu
                      items={[
                        { label: 'Edit', onClick: () => navigate(`/manage/meals/${m.id}/edit`) },
                        { label: 'Delete', danger: true, onClick: () => setPendingDelete(m) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
              {filteredMeals.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-cell">
                    No meals found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <AddMealDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onManual={() => navigate('/manage/meals/new')}
        onImported={({ draft, warnings }) =>
          navigate('/manage/meals/new', { state: { prefill: draft, importWarnings: warnings } })
        }
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete meal?"
        message={`Delete "${pendingDelete?.name}"? If it's referenced in history it will be deactivated instead.`}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
