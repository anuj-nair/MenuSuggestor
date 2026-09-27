import { missingProteins } from './constraintCheck.service.js';

export const CORE_TYPES = ['salad', 'rice', 'roti', 'pasta', 'noodle', 'soup', 'grain'];
export const FREE_TYPE = 'free';

function groupByType(meals) {
  const map = {};
  for (const meal of meals) {
    for (const type of meal.types || []) {
      if (!map[type]) map[type] = [];
      map[type].push(meal);
    }
  }
  return map;
}

function pickRandom(arr, random) {
  if (arr.length === 0) return null;
  return arr[Math.floor(random() * arr.length)];
}

function shuffle(arr, random) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function hasRequiredProtein(meal) {
  return meal.proteinTags.has('chicken') || meal.proteinTags.has('tofu');
}

/**
 * Build the sequence of meal_types for the week, optionally swapping one
 * core slot for 'free'.
 */
export function buildTypeSequence({ includeFreeDay, random = Math.random }) {
  const sequence = [...CORE_TYPES];
  if (includeFreeDay) {
    const idx = Math.floor(random() * sequence.length);
    sequence[idx] = FREE_TYPE;
  }
  return shuffle(sequence, random);
}

/**
 * Pick one meal per (date, type) slot, then run a repair pass to satisfy
 * the chicken/tofu coverage requirement across the week where possible.
 * Prefers not reusing the same meal twice in one week (newly possible now
 * that a meal can carry multiple type tags) — but protein-coverage repair
 * takes priority over avoiding a repeat.
 *
 * @param {Array} meals - active meals from the catalog: {id, types: string[], proteinTags: Set<string>, ...}
 * @param {Array<string>} dates - 7 ISO date strings
 * @param {boolean} includeFreeDay
 * @param {Function} random - injectable RNG for testability
 */
export function generateWeek({ meals, dates, includeFreeDay = false, random = Math.random }) {
  const byType = groupByType(meals);
  const typeSequence = buildTypeSequence({ includeFreeDay, random });

  const usedMealIds = new Set();
  const picks = dates.map((date, i) => {
    const type = typeSequence[i];
    const pool = byType[type] || [];
    const unusedPool = pool.filter((m) => !usedMealIds.has(m.id));
    const finalPool = unusedPool.length > 0 ? unusedPool : pool;
    const meal = pickRandom(finalPool, random);
    if (meal) usedMealIds.add(meal.id);
    return { date, meal_type: type, meal, reused: unusedPool.length === 0 && pool.length > 0 };
  });

  const warnings = [];
  for (const p of picks) {
    if (!p.meal) {
      warnings.push(
        `No meal available for type "${p.meal_type}" — add at least one meal of this type to the catalog.`
      );
    } else if (p.reused) {
      warnings.push(
        `Reused "${p.meal.name}" for ${p.meal_type} — not enough distinct ${p.meal_type} meals in the catalog to avoid repeats this week.`
      );
    }
  }

  // Repair pass: try to satisfy chicken + tofu coverage.
  const currentMeals = picks.map((p) => p.meal);
  const missing = missingProteins(currentMeals);

  for (const protein of missing) {
    // Prefer a slot whose current meal doesn't already cover a required
    // protein, so we don't displace a slot covering the OTHER requirement.
    const candidateSlots = picks
      .map((p, idx) => ({ p, idx }))
      .filter(({ p }) => p.meal && !hasRequiredProtein(p.meal));

    let fixed = false;
    for (const { p, idx } of candidateSlots) {
      const usedElsewhere = new Set(
        picks.filter((_, i2) => i2 !== idx).map((pp) => pp.meal?.id).filter(Boolean)
      );
      const candidates = (byType[p.meal_type] || []).filter((m) => m.proteinTags.has(protein));
      const preferred = candidates.filter((m) => !usedElsewhere.has(m.id));
      const finalPool = preferred.length > 0 ? preferred : candidates;
      if (finalPool.length > 0) {
        picks[idx] = { ...p, meal: pickRandom(finalPool, random) };
        fixed = true;
        break;
      }
    }

    if (!fixed) {
      warnings.push(
        `Could not find a "${protein}" meal among this week's types — add a meal with a "${protein}"-tagged ingredient to one of: ${typeSequence.join(', ')}.`
      );
    }
  }

  return { days: picks, warnings };
}

/**
 * Re-pick a single day's meal within its existing meal_type, preserving
 * chicken/tofu coverage across the rest of the week where possible, and
 * preferring not to duplicate a meal already used elsewhere this week.
 *
 * @param {Array} meals - active meals from the catalog
 * @param {Object} targetDay - { date, meal_type, meal } the day being refreshed
 * @param {Array} otherDays - the other 6 days' { meal_type, meal } in this week
 * @param {boolean} force - if true, ignore constraint preservation
 */
export function refreshDay({ meals, targetDay, otherDays, force = false, random = Math.random }) {
  const byType = groupByType(meals);
  const type = targetDay.meal_type;
  const currentMealId = targetDay.meal?.id;

  const otherChickenCount = otherDays.filter((d) => d.meal?.proteinTags?.has('chicken')).length;
  const otherTofuCount = otherDays.filter((d) => d.meal?.proteinTags?.has('tofu')).length;

  const mustPreserveChicken = otherChickenCount === 0 && targetDay.meal?.proteinTags?.has('chicken');
  const mustPreserveTofu = otherTofuCount === 0 && targetDay.meal?.proteinTags?.has('tofu');

  const usedElsewhereIds = new Set(otherDays.map((d) => d.meal?.id).filter(Boolean));
  let pool = (byType[type] || []).filter((m) => m.id !== currentMealId);
  const poolNoReuse = pool.filter((m) => !usedElsewhereIds.has(m.id));
  pool = poolNoReuse.length > 0 ? poolNoReuse : pool;

  if (!force) {
    if (mustPreserveChicken) pool = pool.filter((m) => m.proteinTags.has('chicken'));
    if (mustPreserveTofu) pool = pool.filter((m) => m.proteinTags.has('tofu'));
  }

  if (pool.length === 0) {
    if (!force && (mustPreserveChicken || mustPreserveTofu)) {
      const protein = mustPreserveChicken ? 'chicken' : 'tofu';
      return {
        day: targetDay,
        warning: `No alternative "${type}" meal available without losing the week's only ${protein} meal. Pick a different day to refresh, add more ${type} meals with a "${protein}"-tagged ingredient, or retry with force=true.`,
      };
    }
    return {
      day: targetDay,
      warning: `No alternative "${type}" meal available in the catalog.`,
    };
  }

  const newMeal = pickRandom(pool, random);
  let warning = null;
  if (force && (mustPreserveChicken || mustPreserveTofu) && !hasRequiredProtein(newMeal)) {
    warning = `Week no longer has a ${mustPreserveChicken ? 'chicken' : 'tofu'} meal.`;
  } else if (poolNoReuse.length === 0 && pool.length > 0 && usedElsewhereIds.has(newMeal.id)) {
    warning = `"${newMeal.name}" is already used elsewhere this week — not enough alternative "${type}" meals to avoid a repeat.`;
  }

  return { day: { ...targetDay, meal: newMeal }, warning };
}
