import { useEffect, useState } from 'react';
import { createMeal, updateMeal } from '../api/meals.api.js';
import TagInput from './TagInput.jsx';
import IngredientDraftEditor from './IngredientDraftEditor.jsx';
import InstructionsEditor from './InstructionsEditor.jsx';

function ingredientsToDraftRows(ingredients) {
  return (ingredients || []).map((ing) => ({
    key: `existing-${ing.ingredient_id}`,
    ingredient_id: ing.ingredient_id,
    ingredient_name: null,
    displayName: ing.name,
    quantity: ing.quantity ?? '',
    unit: ing.unit ?? '',
  }));
}

function prefillToDraft(prefill) {
  return {
    ...emptyDraft(),
    name: prefill.name || '',
    description: prefill.description || '',
    notes: prefill.notes || '',
    types: prefill.types || [],
    cuisines: prefill.cuisines || [],
    instructions: prefill.instructions || [],
    ingredients: (prefill.ingredients || []).map((ing, i) => ({
      key: `imported-${i}`,
      ingredient_id: ing.ingredient_id,
      ingredient_name: ing.ingredient_name,
      displayName: ing.displayName,
      quantity: ing.quantity ?? '',
      unit: ing.unit ?? '',
      tags: ing.tags || [],
    })),
  };
}

function emptyDraft() {
  return { name: '', description: '', notes: '', types: [], cuisines: [], ingredients: [], instructions: [] };
}

export default function MealForm({ meal, initialDraft, cuisines, mealTypes, catalogIngredients, units, onSaved, onCancel }) {
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setDraft(
      meal
        ? {
            name: meal.name,
            description: meal.description || '',
            notes: meal.notes || '',
            types: meal.types || [],
            cuisines: meal.cuisines || [],
            ingredients: ingredientsToDraftRows(meal.ingredients),
            instructions: meal.instructions || [],
          }
        : initialDraft
          ? prefillToDraft(initialDraft)
          : emptyDraft()
    );
  }, [meal, initialDraft]);

  const setField = (field) => (value) => setDraft((d) => ({ ...d, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (draft.types.length === 0) {
      setError('At least one meal type is required.');
      return;
    }
    if (draft.cuisines.length === 0) {
      setError('At least one cuisine is required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        notes: draft.notes.trim() || null,
        types: draft.types,
        cuisines: draft.cuisines,
        ingredients: draft.ingredients.map((row) => ({
          ingredient_id: row.ingredient_id || undefined,
          ingredient_name: row.ingredient_id ? undefined : row.ingredient_name || row.displayName,
          quantity: row.quantity !== '' ? Number(row.quantity) : null,
          unit: row.unit || null,
          tags: row.tags,
        })),
        instructions: draft.instructions.map((step) => step.trim()).filter(Boolean),
      };

      let result;
      if (meal) {
        result = await updateMeal(meal.id, payload);
      } else {
        result = await createMeal(payload);
      }
      onSaved(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="meal-form-panel" onSubmit={handleSubmit}>
      <div className="meal-form-body">
        <h3>{meal ? 'Edit Meal' : initialDraft ? 'Review Imported Meal' : 'Add Meal'}</h3>
        {error && <p className="field-error">{error}</p>}

        <label>
          Name
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setField('name')(e.target.value)}
            required
          />
        </label>

        <label>
          Description
          <input
            type="text"
            value={draft.description}
            onChange={(e) => setField('description')(e.target.value)}
            placeholder="A short line shown at the top of the meal's profile page"
          />
        </label>

        <TagInput
          label="Meal Type(s)"
          values={draft.types}
          onChange={setField('types')}
          options={mealTypes}
          placeholder="salad, rice, roti... press Enter to add"
          required
        />

        <TagInput
          label="Cuisine(s)"
          values={draft.cuisines}
          onChange={setField('cuisines')}
          options={cuisines}
          placeholder="Indian, Italian... press Enter to add"
          required
        />

        <label>
          Notes
          <textarea value={draft.notes} onChange={(e) => setField('notes')(e.target.value)} rows={2} />
        </label>

        <IngredientDraftEditor
          ingredients={draft.ingredients}
          onChange={setField('ingredients')}
          catalogIngredients={catalogIngredients}
          units={units}
        />

        <InstructionsEditor instructions={draft.instructions} onChange={setField('instructions')} />
      </div>

      <div className="meal-form-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : meal ? 'Save Changes' : 'Create Meal'}
        </button>
      </div>
    </form>
  );
}
