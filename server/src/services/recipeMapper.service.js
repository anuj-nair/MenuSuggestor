// Turns a recipe_ingestion RecipeRecord (recipe_ingestion/recipe_ingestion/schema.py)
// into shapes the product DB / meal form understand. Shared by the bulk
// importRecipes.js script and the in-app "import a recipe" flow.
import db from '../db/index.js';

// meal_ingredients is UNIQUE(meal_id, ingredient_id): the same ingredient name
// can legitimately appear under two of the source recipe's groups (e.g. garlic
// powder in both a "Chicken" and a "Sauce" section). Same name + same unit is
// summed; a unit mismatch keeps the first occurrence and raw_text from both is
// preserved in a warning so nothing is silently dropped.
export function mergeIngredients(ingredients) {
  const byKey = new Map();
  const warnings = [];
  for (const ing of ingredients) {
    const key = `${ing.name.trim().toLowerCase()}::${(ing.unit || '').trim().toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...ing, tags: [...(ing.tags || [])] });
      continue;
    }
    if (existing.quantity != null && ing.quantity != null) {
      existing.quantity += ing.quantity;
    } else {
      existing.quantity = existing.quantity ?? ing.quantity;
    }
    for (const tag of ing.tags || []) {
      if (!existing.tags.includes(tag)) existing.tags.push(tag);
    }
  }
  // Ingredients with the same name but different units can't be summed into
  // one meal_ingredients row; keep every distinct (name, unit) pair as its
  // own row (that's what the UNIQUE constraint is actually keyed on), and
  // just warn when the same name shows up more than once so it's visible.
  const seenNames = new Map();
  for (const ing of ingredients) {
    const nameKey = ing.name.trim().toLowerCase();
    seenNames.set(nameKey, (seenNames.get(nameKey) || 0) + 1);
  }
  for (const [name, count] of seenNames) {
    if (count > 1) warnings.push(`"${name}" appears ${count} times across groups; quantities summed where units matched.`);
  }
  return { merged: [...byKey.values()], warnings };
}

// The weekly generator only counts ingredients tagged exactly 'chicken' or
// 'tofu', and the model sometimes tags them generically (e.g. 'protein').
const REQUIRED_PROTEIN_TAGS = ['chicken', 'tofu'];

function withProteinTags(name, tags) {
  const lowerName = name.toLowerCase();
  const lowerTags = tags.map((t) => t.toLowerCase());
  const extra = REQUIRED_PROTEIN_TAGS.filter((p) => lowerName.includes(p) && !lowerTags.includes(p));
  return [...tags, ...extra];
}

export function buildNotes(recipe) {
  const extra = [];
  if (recipe.servings) extra.push(`Servings: ${recipe.servings}`);
  if (recipe.total_time_minutes) extra.push(`Total time: ${recipe.total_time_minutes} min`);
  if (extra.length === 0) return recipe.notes || null;
  return `${recipe.notes || ''}\n${extra.join(' · ')}`.trim();
}

// Builds a pre-filled (unsaved) meal-form draft. Ingredients already in the
// catalog (case-insensitive name match, same rule as
// resolveOrCreateIngredientByName) are linked by id; the rest go in as new
// names, with a unit defaulted to 'each' so saving doesn't trip the
// "enter a unit" check for brand-new catalog entries.
export function recordToMealDraft(record) {
  const recipe = record.recipe;
  const { merged, warnings } = mergeIngredients(recipe.ingredients || []);
  const findByName = db.prepare('SELECT id, name, default_unit FROM ingredients WHERE LOWER(name) = LOWER(?) ORDER BY id');

  const ingredients = merged.map((ing) => {
    const unit = ing.unit && ing.unit.trim() ? ing.unit.trim() : 'each';
    const matches = findByName.all(ing.name.trim());
    const match = matches.find((m) => m.default_unit.toLowerCase() === unit.toLowerCase()) || matches[0];
    return {
      ingredient_id: match ? match.id : null,
      ingredient_name: match ? null : ing.name.trim(),
      displayName: match ? match.name : ing.name.trim(),
      quantity: ing.quantity ?? null,
      unit,
      tags: withProteinTags(ing.name, ing.tags || []),
    };
  });

  const draft = {
    name: (recipe.name || '').trim(),
    description: null,
    notes: buildNotes(recipe),
    types: recipe.meal_types || [],
    cuisines: recipe.cuisines || [],
    ingredients,
    instructions: recipe.instructions || [],
  };

  const allWarnings = [...warnings, ...(record.metadata?.validation_warnings || [])];
  if (recipe.confidence_notes) allWarnings.push(recipe.confidence_notes);
  return { draft, warnings: allWarnings };
}
