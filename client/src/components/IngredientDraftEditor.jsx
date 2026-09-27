import { useState } from 'react';

export default function IngredientDraftEditor({ ingredients, onChange, catalogIngredients, units }) {
  const [ingredientName, setIngredientName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [error, setError] = useState(null);

  const trimmedName = ingredientName.trim();
  // The catalog can hold more than one entry for a name, distinguished by unit
  // (e.g. "Garlic" by the clove vs. by the head). Prefer the one matching the
  // unit typed here, falling back to the first by name — this recipe's own
  // unit doesn't need to match a catalog entry exactly either way.
  const nameMatches = (catalogIngredients || []).filter(
    (i) => i.name.toLowerCase() === trimmedName.toLowerCase()
  );
  const trimmedUnit = unit.trim();
  const matchedIngredient =
    (trimmedUnit && nameMatches.find((i) => i.default_unit.toLowerCase() === trimmedUnit.toLowerCase())) ||
    nameMatches[0];
  const alreadyAdded = ingredients.some((row) =>
    matchedIngredient
      ? row.ingredient_id === matchedIngredient.id
      : row.displayName.toLowerCase() === trimmedName.toLowerCase()
  );
  const isNewIngredient = trimmedName.length > 0 && !matchedIngredient;
  const quantityIsInvalid = quantity !== '' && Number(quantity) < 0;

  const handleAdd = (e) => {
    e?.preventDefault();
    setError(null);

    if (!trimmedName) return;
    if (quantityIsInvalid) {
      setError('Quantity cannot be negative.');
      return;
    }
    if (isNewIngredient && !unit.trim()) {
      setError(`"${trimmedName}" isn't in your catalog yet — enter a unit so it can be added.`);
      return;
    }
    if (alreadyAdded) {
      setError(`"${trimmedName}" is already in this meal's ingredient list.`);
      return;
    }

    const row = {
      key: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ingredient_id: matchedIngredient ? matchedIngredient.id : null,
      ingredient_name: matchedIngredient ? null : trimmedName,
      displayName: trimmedName,
      quantity: quantity,
      unit: unit,
    };
    onChange([...ingredients, row]);
    setIngredientName('');
    setQuantity('');
    setUnit('');
  };

  const updateRow = (key, field, value) => {
    onChange(ingredients.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  };

  const removeRow = (key) => {
    onChange(ingredients.filter((row) => row.key !== key));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="ingredients-editor">
      <h4>Ingredients (optional)</h4>
      {error && <p className="field-error">{error}</p>}

      {ingredients.length > 0 && (
        <ul className="linked-ingredients-list">
          {ingredients.map((row) => (
            <li key={row.key}>
              <span className="ingredient-row-name">{row.displayName}</span>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="Qty"
                value={row.quantity}
                onChange={(e) => updateRow(row.key, 'quantity', e.target.value)}
                className="qty-input"
              />
              <input
                type="text"
                placeholder="Unit"
                value={row.unit}
                onChange={(e) => updateRow(row.key, 'unit', e.target.value)}
                list="unit-options-editor"
                className="unit-input"
              />
              <button type="button" className="btn btn-text btn-small" onClick={() => removeRow(row.key)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="inline-form">
        <input
          type="text"
          placeholder="Ingredient (type to search or add new)"
          value={ingredientName}
          onChange={(e) => setIngredientName(e.target.value)}
          onKeyDown={handleKeyDown}
          list="ingredient-options"
          className="ingredient-input"
        />
        <datalist id="ingredient-options">
          {(catalogIngredients || []).map((i) => (
            <option key={i.id} value={i.name} />
          ))}
        </datalist>

        <input
          type="text"
          placeholder={matchedIngredient ? `Unit (default: ${matchedIngredient.default_unit})` : 'Unit'}
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          onKeyDown={handleKeyDown}
          list="unit-options-editor"
          className="unit-input"
        />
        <datalist id="unit-options-editor">
          {(units || []).map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>

        <input
          type="number"
          step="any"
          min="0"
          placeholder="Qty"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          onKeyDown={handleKeyDown}
          className="qty-input"
        />

        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={handleAdd}
          disabled={!trimmedName || quantityIsInvalid || (isNewIngredient && !unit.trim())}
        >
          {isNewIngredient ? 'Add new' : 'Add'}
        </button>
      </div>

      {isNewIngredient && (
        <p className="hint">"{trimmedName}" isn't in your catalog yet — it'll be added as a new ingredient when you save.</p>
      )}
    </div>
  );
}
