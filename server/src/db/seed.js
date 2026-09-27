import db from './index.js';

const ingredients = [
  { name: 'Chicken breast', default_unit: 'g', tags: ['chicken'] },
  { name: 'Firm tofu', default_unit: 'g', tags: ['tofu'] },
  { name: 'Basmati rice', default_unit: 'cup', tags: ['grain'] },
  { name: 'Whole wheat flour', default_unit: 'cup', tags: ['grain'] },
  { name: 'Pasta (penne)', default_unit: 'g', tags: ['grain'] },
  { name: 'Rice noodles', default_unit: 'g', tags: ['grain'] },
  { name: 'Quinoa', default_unit: 'cup', tags: ['grain'] },
  { name: 'Mixed greens', default_unit: 'cup', tags: ['vegetable'] },
  { name: 'Vegetable broth', default_unit: 'cup', tags: [] },
  { name: 'Onion', default_unit: 'piece', tags: ['vegetable'] },
  { name: 'Garlic', default_unit: 'clove', tags: ['vegetable'] },
  { name: 'Olive oil', default_unit: 'tbsp', tags: [] },
];

const meals = [
  {
    name: 'Quinoa Salad with Chicken',
    cuisines: ['Mediterranean'],
    types: ['salad'],
    notes: 'Quinoa, mixed greens, grilled chicken, lemon-olive oil dressing.',
    ingredients: [
      { name: 'Quinoa', quantity: 1, unit: 'cup' },
      { name: 'Mixed greens', quantity: 2, unit: 'cup' },
      { name: 'Chicken breast', quantity: 150, unit: 'g' },
      { name: 'Olive oil', quantity: 1, unit: 'tbsp' },
    ],
  },
  {
    name: 'Chicken Biryani',
    cuisines: ['Indian'],
    types: ['rice'],
    notes: 'Layered spiced rice with marinated chicken.',
    ingredients: [
      { name: 'Basmati rice', quantity: 1.5, unit: 'cup' },
      { name: 'Chicken breast', quantity: 200, unit: 'g' },
      { name: 'Onion', quantity: 1, unit: 'piece' },
      { name: 'Garlic', quantity: 3, unit: 'clove' },
    ],
  },
  {
    name: 'Tofu Butter Masala with Roti',
    cuisines: ['Indian'],
    types: ['roti'],
    notes: 'Creamy tomato-based curry with pan-fried tofu.',
    ingredients: [
      { name: 'Firm tofu', quantity: 200, unit: 'g' },
      { name: 'Whole wheat flour', quantity: 1, unit: 'cup' },
      { name: 'Onion', quantity: 1, unit: 'piece' },
    ],
  },
  {
    name: 'Garlic Olive Oil Pasta',
    cuisines: ['Italian'],
    types: ['pasta'],
    notes: 'Simple aglio e olio style pasta.',
    ingredients: [
      { name: 'Pasta (penne)', quantity: 200, unit: 'g' },
      { name: 'Garlic', quantity: 4, unit: 'clove' },
      { name: 'Olive oil', quantity: 2, unit: 'tbsp' },
    ],
  },
  {
    name: 'Tofu Pad Thai Noodles',
    cuisines: ['Thai'],
    types: ['noodle'],
    notes: 'Stir-fried rice noodles with tofu and peanuts.',
    ingredients: [
      { name: 'Rice noodles', quantity: 200, unit: 'g' },
      { name: 'Firm tofu', quantity: 150, unit: 'g' },
      { name: 'Garlic', quantity: 2, unit: 'clove' },
    ],
  },
  {
    name: 'Veggie Soup',
    cuisines: ['American'],
    types: ['soup'],
    notes: 'Light vegetable broth soup with seasonal veggies.',
    ingredients: [
      { name: 'Vegetable broth', quantity: 3, unit: 'cup' },
      { name: 'Onion', quantity: 1, unit: 'piece' },
      { name: 'Garlic', quantity: 2, unit: 'clove' },
    ],
  },
  {
    name: 'Bulgur Pilaf',
    cuisines: ['Middle Eastern'],
    types: ['grain'],
    notes: 'Bulgur wheat pilaf with sauteed onions.',
    ingredients: [
      { name: 'Quinoa', quantity: 1, unit: 'cup' },
      { name: 'Onion', quantity: 1, unit: 'piece' },
    ],
  },
  {
    name: 'Homemade Pizza',
    cuisines: ['Italian'],
    types: ['free'],
    notes: 'Free day treat.',
    ingredients: [],
  },
];

const insertIngredient = db.prepare(
  'INSERT OR IGNORE INTO ingredients (name, default_unit) VALUES (?, ?)'
);
const getIngredientId = db.prepare('SELECT id FROM ingredients WHERE name = ?');
const insertIngredientTag = db.prepare(
  'INSERT OR IGNORE INTO ingredient_tags (ingredient_id, tag) VALUES (?, ?)'
);
const insertMeal = db.prepare(`INSERT INTO meals (name, notes) VALUES (?, ?)`);
const insertMealType = db.prepare('INSERT OR IGNORE INTO meal_types (meal_id, type) VALUES (?, ?)');
const insertMealCuisine = db.prepare(
  'INSERT OR IGNORE INTO meal_cuisines (meal_id, cuisine) VALUES (?, ?)'
);
const insertLink = db.prepare(
  `INSERT OR IGNORE INTO meal_ingredients (meal_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)`
);
const mealExists = db.prepare('SELECT id FROM meals WHERE name = ?');

const seed = db.transaction(() => {
  for (const ing of ingredients) {
    insertIngredient.run(ing.name, ing.default_unit);
    const ingredientRow = getIngredientId.get(ing.name);
    for (const tag of ing.tags) {
      insertIngredientTag.run(ingredientRow.id, tag);
    }
  }

  for (const meal of meals) {
    if (mealExists.get(meal.name)) continue;
    const result = insertMeal.run(meal.name, meal.notes);
    const mealId = result.lastInsertRowid;
    for (const type of meal.types) insertMealType.run(mealId, type);
    for (const cuisine of meal.cuisines) insertMealCuisine.run(mealId, cuisine);
    for (const link of meal.ingredients) {
      const ingredientRow = getIngredientId.get(link.name);
      if (ingredientRow) {
        insertLink.run(mealId, ingredientRow.id, link.quantity, link.unit);
      }
    }
  }
});

seed();
console.log('Seed complete.');
