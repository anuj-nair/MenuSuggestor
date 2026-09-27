import { useState } from 'react';
import { useFetch } from '../hooks/useFetch.js';
import { getIngredients, createIngredient, updateIngredient, getUnits, getIngredientTags } from '../api/ingredients.api.js';
import Banner from './Banner.jsx';
import TagInput from './TagInput.jsx';

const emptyForm = { name: '', default_unit: '', tags: [] };

export default function IngredientsManager() {
  const { data: ingredients, loading, error, refetch } = useFetch(() => getIngredients(), []);
  const { data: units, refetch: refetchUnits } = useFetch(() => getUnits(), []);
  const { data: tagOptions, refetch: refetchTagOptions } = useFetch(() => getIngredientTags(), []);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [banner, setBanner] = useState(null);

  const startEdit = (ing) => {
    setEditingId(ing.id);
    setForm({ name: ing.name, default_unit: ing.default_unit, tags: ing.tags || [] });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBanner(null);
    try {
      if (editingId) {
        const result = await updateIngredient(editingId, form);
        if (result?.merged) {
          setBanner({
            type: 'info',
            text: `"${form.name}" already existed — merged into it and re-routed its meals.`,
          });
        }
      } else {
        await createIngredient(form);
      }
      resetForm();
      refetch();
      refetchUnits();
      refetchTagOptions();
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    }
  };

  return (
    <div>
      <Banner type={banner?.type} onDismiss={() => setBanner(null)}>
        {banner?.text}
      </Banner>

      <form className="inline-form ingredient-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Ingredient name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
        />
        <input
          type="text"
          placeholder="Default unit (g, cup, piece...)"
          value={form.default_unit}
          onChange={(e) => setForm((f) => ({ ...f, default_unit: e.target.value }))}
          list="unit-options"
          required
        />
        <datalist id="unit-options">
          {(units || []).map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <TagInput
          values={form.tags}
          onChange={(tags) => setForm((f) => ({ ...f, tags }))}
          options={tagOptions}
          placeholder="Tags: chicken, tofu, grain... press Enter"
        />
        <button type="submit" className="btn btn-primary btn-small">
          {editingId ? 'Save' : 'Add'}
        </button>
        {editingId && (
          <button type="button" className="btn btn-secondary btn-small" onClick={resetForm}>
            Cancel
          </button>
        )}
      </form>

      {loading && <p>Loading ingredients...</p>}
      {error && <Banner type="error">{error.message}</Banner>}

      {ingredients && (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Default Unit</th>
                <th>Tags</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map((i) => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td>{i.default_unit}</td>
                  <td>
                    {(i.tags || []).map((t) => (
                      <span key={t} className="pill">
                        {t}
                      </span>
                    ))}
                  </td>
                  <td className="row-actions">
                    <button className="btn btn-text btn-small" onClick={() => startEdit(i)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {ingredients.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty-cell">
                    No ingredients yet.
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
