import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWeek, refreshDay, CORE_TYPES } from '../src/services/planGenerator.service.js';

function makeCatalog() {
  let id = 1;
  const meal = (typeOrTypes, proteins = [], overrides = {}) => {
    const types = Array.isArray(typeOrTypes) ? typeOrTypes : [typeOrTypes];
    return {
      id: id++,
      name: `${types.join('+')}-${proteins.join('+') || 'none'}-${id}`,
      types,
      proteinTags: new Set(proteins),
      is_active: 1,
      ...overrides,
    };
  };

  const meals = [];
  for (const type of CORE_TYPES) {
    meals.push(meal(type));
    meals.push(meal(type));
  }
  // exactly one chicken meal (rice) and one tofu meal (noodle)
  meals.push(meal('rice', ['chicken']));
  meals.push(meal('noodle', ['tofu']));
  // a free-type meal
  meals.push(meal('free'));
  return meals;
}

function seededRandom(seedStart = 1) {
  let seed = seedStart;
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

const dates = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];

test('generateWeek without free day covers all 7 core types exactly once', () => {
  const meals = makeCatalog();
  const { days } = generateWeek({ meals, dates, includeFreeDay: false, random: seededRandom(1) });
  assert.equal(days.length, 7);
  const types = days.map((d) => d.meal_type).sort();
  assert.deepEqual(types, [...CORE_TYPES].sort());
});

test('generateWeek includes at least one chicken and one tofu meal', () => {
  const meals = makeCatalog();
  const { days, warnings } = generateWeek({ meals, dates, includeFreeDay: false, random: seededRandom(7) });
  const hasChicken = days.some((d) => d.meal?.proteinTags.has('chicken'));
  const hasTofu = days.some((d) => d.meal?.proteinTags.has('tofu'));
  assert.ok(hasChicken, `expected a chicken meal in ${JSON.stringify(days.map((d) => d.meal?.name))}`);
  assert.ok(hasTofu, `expected a tofu meal in ${JSON.stringify(days.map((d) => d.meal?.name))}`);
  assert.equal(warnings.length, 0);
});

test('generateWeek with free day swaps exactly one core slot for free', () => {
  const meals = makeCatalog();
  const { days } = generateWeek({ meals, dates, includeFreeDay: true, random: seededRandom(3) });
  const types = days.map((d) => d.meal_type);
  const freeCount = types.filter((t) => t === 'free').length;
  const coreCount = types.filter((t) => CORE_TYPES.includes(t)).length;
  assert.equal(freeCount, 1);
  assert.equal(coreCount, 6);
});

test('generateWeek never reuses the same meal twice when the catalog has enough distinct meals', () => {
  const meals = makeCatalog();
  const { days } = generateWeek({ meals, dates, includeFreeDay: false, random: seededRandom(11) });
  const ids = days.map((d) => d.meal?.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, `expected no repeats, got ${JSON.stringify(ids)}`);
});

test('generateWeek reuses a meal (with a warning) when a multi-type meal is the only option for two slots', () => {
  let id = 1;
  const meal = (types, proteins = []) => ({
    id: id++,
    name: `meal-${id}`,
    types,
    proteinTags: new Set(proteins),
    is_active: 1,
  });
  // Only ONE meal exists for 'rice' and 'soup', and it covers both via multi-type tags.
  const thinMeals = [
    meal(['rice', 'soup'], ['chicken']),
    meal(['salad']),
    meal(['roti']),
    meal(['pasta']),
    meal(['noodle'], ['tofu']),
    meal(['grain']),
  ];

  const { days, warnings } = generateWeek({
    meals: thinMeals,
    dates,
    includeFreeDay: false,
    random: seededRandom(2),
  });

  const riceDay = days.find((d) => d.meal_type === 'rice');
  const soupDay = days.find((d) => d.meal_type === 'soup');
  assert.equal(riceDay.meal.id, soupDay.meal.id, 'the only rice+soup meal should fill both slots');
  assert.ok(
    warnings.some((w) => w.includes('Reused')),
    `expected a reuse warning, got ${JSON.stringify(warnings)}`
  );
});

test('refreshDay preserves the sole chicken meal by restricting candidate pool', () => {
  const meals = makeCatalog();
  const chickenMeal = meals.find((m) => m.proteinTags.has('chicken'));
  const secondChicken = {
    id: 999,
    name: 'rice-chicken-2',
    types: ['rice'],
    proteinTags: new Set(['chicken']),
    is_active: 1,
  };
  const extendedMeals = [...meals, secondChicken];

  const targetDay = { date: dates[0], meal_type: 'rice', meal: chickenMeal };
  const otherDays = [
    { date: dates[1], meal_type: 'noodle', meal: meals.find((m) => m.proteinTags.has('tofu')) },
    { date: dates[2], meal_type: 'salad', meal: meals.find((m) => m.types.includes('salad')) },
  ];

  const { day, warning } = refreshDay({
    meals: extendedMeals,
    targetDay,
    otherDays,
    random: seededRandom(5),
  });

  assert.equal(warning, null);
  assert.ok(day.meal.proteinTags.has('chicken'));
  assert.ok(day.meal.types.includes('rice'));
});

test('refreshDay warns instead of dropping the only chicken meal when no alternative exists', () => {
  const meals = makeCatalog();
  const chickenMeal = meals.find((m) => m.proteinTags.has('chicken'));

  const targetDay = { date: dates[0], meal_type: 'rice', meal: chickenMeal };
  const otherDays = [
    { date: dates[1], meal_type: 'noodle', meal: meals.find((m) => m.proteinTags.has('tofu')) },
  ];

  const { day, warning } = refreshDay({ meals, targetDay, otherDays, random: seededRandom(2) });

  assert.ok(warning, 'expected a warning when no safe alternative exists');
  assert.equal(day.meal.id, chickenMeal.id, 'meal should be left unchanged');
});

test('refreshDay with force=true allows breaking the constraint', () => {
  const meals = makeCatalog();
  const chickenMeal = meals.find((m) => m.proteinTags.has('chicken'));

  const targetDay = { date: dates[0], meal_type: 'rice', meal: chickenMeal };
  const otherDays = [
    { date: dates[1], meal_type: 'noodle', meal: meals.find((m) => m.proteinTags.has('tofu')) },
  ];

  const { day } = refreshDay({ meals, targetDay, otherDays, force: true, random: seededRandom(4) });
  assert.notEqual(day.meal.id, chickenMeal.id);
});
