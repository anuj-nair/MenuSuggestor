// One-off script to wipe meals (and, unless --meals-only is given, the
// ingredient catalog) before a fresh manual import. Destructive and
// unrecoverable except via the backup this script makes, so it defaults to
// a dry run: pass --yes to actually delete anything.
//
//   node src/db/clearMeals.js            # preview only
//   node src/db/clearMeals.js --yes      # back up the db file, then wipe
//   node src/db/clearMeals.js --yes --meals-only   # keep the ingredient catalog
//
// Deleting from `meals` cascades to meal_types, meal_cuisines,
// meal_ingredients and meal_instructions (all ON DELETE CASCADE). Deleting
// from `ingredients` cascades to ingredient_tags the same way. meal_history
// rows are kept — their meal_id just becomes NULL (ON DELETE SET NULL) so
// past history isn't lost.
import fs from 'node:fs';
import path from 'node:path';
import db from './index.js';

const args = process.argv.slice(2);
const apply = args.includes('--yes');
const mealsOnly = args.includes('--meals-only');

const counts = {
  meals: db.prepare('SELECT COUNT(*) AS n FROM meals').get().n,
  ingredients: db.prepare('SELECT COUNT(*) AS n FROM ingredients').get().n,
  meal_history_linked: db.prepare('SELECT COUNT(*) AS n FROM meal_history WHERE meal_id IS NOT NULL').get().n,
};

console.log('Current data:');
console.log(`  meals:                ${counts.meals}`);
console.log(`  ingredients (catalog): ${counts.ingredients}`);
console.log(`  meal_history rows pointing at a meal: ${counts.meal_history_linked} (will be kept, meal_id set to NULL)`);
console.log();
console.log(`Will delete: meals (and their types/cuisines/links/instructions)${mealsOnly ? '' : ', plus the ingredient catalog (ingredients + ingredient_tags)'}.`);

if (!apply) {
  console.log('\nDry run only — nothing was deleted. Re-run with --yes to apply.');
  process.exit(0);
}

const dbPath = db.name;
if (dbPath && fs.existsSync(dbPath)) {
  const backupPath = `${dbPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  db.pragma('wal_checkpoint(TRUNCATE)');
  fs.copyFileSync(dbPath, backupPath);
  console.log(`Backed up ${path.basename(dbPath)} -> ${path.basename(backupPath)}`);
}

const clear = db.transaction(() => {
  db.prepare('DELETE FROM meals').run();
  db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('meals','meal_types','meal_cuisines','meal_ingredients','meal_instructions')").run();
  if (!mealsOnly) {
    db.prepare('DELETE FROM ingredients').run();
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('ingredients','ingredient_tags')").run();
  }
});
clear();

console.log('Done.');
