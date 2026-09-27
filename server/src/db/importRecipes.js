// Imports recipe_ingestion's output/recipes/<uuid>.json files into the real
// product DB, one recipe -> one meal. Reuses the same ingredient-catalog
// resolution the API uses (resolveOrCreateIngredientByName), so imported
// ingredients match/reuse existing catalog rows the same way manual entry
// through the app would.
//
//   node src/db/importRecipes.js                          # import everything under recipe_ingestion/output/recipes
//   node src/db/importRecipes.js path/to/one.json path/to/two.json
//   node src/db/importRecipes.js -d path/to/folder        # import every *.json in an arbitrary folder
//   node src/db/importRecipes.js --dry-run                # preview, writes nothing
//   node src/db/importRecipes.js --force                  # re-import even if a meal with that name already exists
//
// Files are imported in natural-numeric order by filename, so a folder named
// with a "NNN-semantic-name.json" convention (e.g. 001-chili-noodles.json,
// 002-garlic-pasta.json, ..., 010-...) imports in that intended order rather
// than lexicographic order (which would put "10-" before "2-").
//
// Not carried over (documented in recipe_ingestion/README.md's DB-mapping
// table): ingredient `group` (no column for it), and `servings` /
// `total_time_minutes` (folded into `notes` as a line instead, since there's
// no dedicated column yet either).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './index.js';
import { resolveOrCreateIngredientByName } from '../services/ingredientResolver.service.js';
import { mergeIngredients, buildNotes } from '../services/recipeMapper.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RECIPES_DIR = path.join(__dirname, '../../../recipe_ingestion/output/recipes');

const rawArgs = process.argv.slice(2);
const dryRun = rawArgs.includes('--dry-run');
const force = rawArgs.includes('--force');
let dirArg = null;
const filePaths = [];
for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i];
  if (arg === '-d' || arg === '--dir') {
    dirArg = rawArgs[++i];
  } else if (arg === '--dry-run' || arg === '--force') {
    // already handled above
  } else if (!arg.startsWith('-')) {
    filePaths.push(arg);
  }
}

// Sorts "NNN-semantic-name.json" (or any filename with a leading number)
// numerically rather than lexicographically, so 2-x.json comes before
// 10-x.json instead of after it.
function naturalCompare(a, b) {
  const aName = path.basename(a);
  const bName = path.basename(b);
  const aNum = aName.match(/^(\d+)/);
  const bNum = bName.match(/^(\d+)/);
  if (aNum && bNum) {
    const diff = Number(aNum[1]) - Number(bNum[1]);
    if (diff !== 0) return diff;
  }
  return aName.localeCompare(bName);
}

function jsonFilesInDir(dir) {
  if (!fs.existsSync(dir)) {
    console.error(`Folder not found: ${dir}`);
    process.exit(1);
  }
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(dir, f))
    .sort(naturalCompare);
}

function collectJsonFiles() {
  if (dirArg) return [...jsonFilesInDir(dirArg), ...filePaths];
  if (filePaths.length > 0) return filePaths;
  return jsonFilesInDir(DEFAULT_RECIPES_DIR);
}

const mealExists = db.prepare('SELECT id FROM meals WHERE name = ?');
const insertMeal = db.prepare('INSERT INTO meals (name, notes) VALUES (?, ?)');
const insertMealType = db.prepare('INSERT OR IGNORE INTO meal_types (meal_id, type) VALUES (?, ?)');
const insertMealCuisine = db.prepare('INSERT OR IGNORE INTO meal_cuisines (meal_id, cuisine) VALUES (?, ?)');
const insertMealIngredient = db.prepare(
  'INSERT OR IGNORE INTO meal_ingredients (meal_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)'
);
const insertIngredientTag = db.prepare('INSERT OR IGNORE INTO ingredient_tags (ingredient_id, tag) VALUES (?, ?)');
const insertInstruction = db.prepare('INSERT INTO meal_instructions (meal_id, step, instruction) VALUES (?, ?, ?)');

function importOne(filePath) {
  const record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const recipe = record.recipe;
  const name = recipe.name.trim();

  if (mealExists.get(name) && !force) {
    console.log(`skip  ${name}  (already in db; pass --force to re-import)`);
    return { status: 'skipped' };
  }

  const { merged, warnings } = mergeIngredients(recipe.ingredients);
  warnings.forEach((w) => console.log(`  warn: ${w}`));

  if (dryRun) {
    console.log(`would import  ${name}  (${merged.length} ingredients, ${recipe.instructions.length} steps)`);
    return { status: 'dry-run' };
  }

  const tx = db.transaction(() => {
    const mealId = insertMeal.run(name, buildNotes(recipe)).lastInsertRowid;
    for (const type of recipe.meal_types || []) insertMealType.run(mealId, type);
    for (const cuisine of recipe.cuisines || []) insertMealCuisine.run(mealId, cuisine);
    for (const ing of merged) {
      const unit = ing.unit && ing.unit.trim() ? ing.unit.trim() : 'each';
      const ingredientId = resolveOrCreateIngredientByName(ing.name, unit);
      insertMealIngredient.run(mealId, ingredientId, ing.quantity ?? null, ing.unit ?? null);
      for (const tag of ing.tags || []) insertIngredientTag.run(ingredientId, tag);
    }
    (recipe.instructions || []).forEach((instruction, i) => insertInstruction.run(mealId, i + 1, instruction));
    return mealId;
  });
  const mealId = tx();
  console.log(`import  ${name}  (id ${mealId}, ${merged.length} ingredients, ${recipe.instructions.length} steps)`);
  return { status: 'imported' };
}

const files = collectJsonFiles();
const source = dirArg || (filePaths.length > 0 ? 'given paths' : DEFAULT_RECIPES_DIR);
console.log(`${dryRun ? 'Dry run: ' : ''}Importing ${files.length} recipe file(s) from ${source}\n`);

const results = { imported: 0, skipped: 0, 'dry-run': 0 };
for (const file of files) {
  const { status } = importOne(file);
  results[status] = (results[status] || 0) + 1;
}

console.log(`\nDone. imported=${results.imported} skipped=${results.skipped}${dryRun ? ` dry-run=${results['dry-run']}` : ''}`);
