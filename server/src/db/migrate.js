import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

db.exec(schema);

function tableSql(name) {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name);
  return row ? row.sql : null;
}

// IMPORTANT: SQLite's `ALTER TABLE x RENAME TO y` automatically rewrites any OTHER
// table's foreign key clauses that reference x, so they point at y instead. Renaming
// a referenced table away (e.g. meals -> meals_old) as scratch space therefore leaves
// child tables (meal_ingredients, meal_history) permanently pointing at the throwaway
// name once it's dropped. The safe rebuild order is: create the new table under a
// temp name, copy data in, DROP the original (this does NOT rewrite child FK text),
// then rename the temp table INTO the original name (nothing references the temp
// name yet, so this rename has nothing to rewrite).

// Older DBs created meals.meal_type / meals.protein / meal_history.meal_type with a
// fixed CHECK(... IN (...)) list. Rebuild those tables (preserving data) so any
// text value is allowed, matching how `cuisine` already works.
function relaxTypeConstraints() {
  const mealsSql = tableSql('meals');
  const historySql = tableSql('meal_history');

  const needsMealsRebuild = mealsSql && /CHECK\s*\(\s*(meal_type|protein)\s+IN/i.test(mealsSql);
  const needsHistoryRebuild = historySql && /CHECK\s*\(\s*meal_type\s+IN/i.test(historySql);

  if (!needsMealsRebuild && !needsHistoryRebuild) return;

  db.pragma('foreign_keys = OFF');

  if (needsMealsRebuild) {
    db.exec(`
      CREATE TABLE meals_new (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        cuisine     TEXT NOT NULL,
        meal_type   TEXT NOT NULL,
        protein     TEXT NOT NULL DEFAULT 'none',
        notes       TEXT,
        is_active   INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO meals_new (id, name, cuisine, meal_type, protein, notes, is_active, created_at, updated_at)
        SELECT id, name, cuisine, meal_type, protein, notes, is_active, created_at, updated_at FROM meals;
      DROP TABLE meals;
      ALTER TABLE meals_new RENAME TO meals;
      CREATE INDEX IF NOT EXISTS idx_meals_type ON meals(meal_type);
      CREATE INDEX IF NOT EXISTS idx_meals_protein ON meals(protein);
      CREATE INDEX IF NOT EXISTS idx_meals_cuisine ON meals(cuisine);
    `);
    console.log('Rebuilt meals table with open meal_type/protein values.');
  }

  if (needsHistoryRebuild) {
    db.exec(`
      CREATE TABLE meal_history_new (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        date           TEXT NOT NULL UNIQUE,
        meal_type      TEXT NOT NULL,
        meal_id        INTEGER REFERENCES meals(id) ON DELETE SET NULL,
        free_text_name TEXT,
        status         TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','eaten','skipped')),
        plan_batch_id  TEXT,
        notes          TEXT,
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO meal_history_new (id, date, meal_type, meal_id, free_text_name, status, plan_batch_id, notes, created_at, updated_at)
        SELECT id, date, meal_type, meal_id, free_text_name, status, plan_batch_id, notes, created_at, updated_at FROM meal_history;
      DROP TABLE meal_history;
      ALTER TABLE meal_history_new RENAME TO meal_history;
      CREATE INDEX IF NOT EXISTS idx_meal_history_date ON meal_history(date);
      CREATE INDEX IF NOT EXISTS idx_meal_history_status ON meal_history(status);
      CREATE INDEX IF NOT EXISTS idx_meal_history_plan_batch ON meal_history(plan_batch_id);
    `);
    console.log('Rebuilt meal_history table with open meal_type values.');
  }

  db.pragma('foreign_keys = ON');
}

// Self-heals DBs that already went through the old (buggy) rename-away migration
// above, which left meal_ingredients / meal_history foreign keys pointing at the
// now-dropped "meals_old" table.
function repairStaleForeignKeys() {
  const miSql = tableSql('meal_ingredients');
  const historySql = tableSql('meal_history');

  const needsMiRepair = miSql && /meals_old/i.test(miSql);
  const needsHistoryFkRepair = historySql && /meals_old/i.test(historySql);

  if (!needsMiRepair && !needsHistoryFkRepair) return;

  db.pragma('foreign_keys = OFF');

  if (needsMiRepair) {
    db.exec(`
      CREATE TABLE meal_ingredients_new (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        meal_id       INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
        ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
        quantity      REAL,
        unit          TEXT,
        UNIQUE (meal_id, ingredient_id)
      );
      INSERT INTO meal_ingredients_new (id, meal_id, ingredient_id, quantity, unit)
        SELECT id, meal_id, ingredient_id, quantity, unit FROM meal_ingredients;
      DROP TABLE meal_ingredients;
      ALTER TABLE meal_ingredients_new RENAME TO meal_ingredients;
      CREATE INDEX IF NOT EXISTS idx_meal_ingredients_meal ON meal_ingredients(meal_id);
      CREATE INDEX IF NOT EXISTS idx_meal_ingredients_ingredient ON meal_ingredients(ingredient_id);
    `);
    console.log('Repaired meal_ingredients foreign key (was pointing at dropped meals_old).');
  }

  if (needsHistoryFkRepair) {
    db.exec(`
      CREATE TABLE meal_history_new (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        date           TEXT NOT NULL UNIQUE,
        meal_type      TEXT NOT NULL,
        meal_id        INTEGER REFERENCES meals(id) ON DELETE SET NULL,
        free_text_name TEXT,
        status         TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','eaten','skipped')),
        plan_batch_id  TEXT,
        notes          TEXT,
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO meal_history_new (id, date, meal_type, meal_id, free_text_name, status, plan_batch_id, notes, created_at, updated_at)
        SELECT id, date, meal_type, meal_id, free_text_name, status, plan_batch_id, notes, created_at, updated_at FROM meal_history;
      DROP TABLE meal_history;
      ALTER TABLE meal_history_new RENAME TO meal_history;
      CREATE INDEX IF NOT EXISTS idx_meal_history_date ON meal_history(date);
      CREATE INDEX IF NOT EXISTS idx_meal_history_status ON meal_history(status);
      CREATE INDEX IF NOT EXISTS idx_meal_history_plan_batch ON meal_history(plan_batch_id);
    `);
    console.log('Repaired meal_history foreign key (was pointing at dropped meals_old).');
  }

  db.pragma('foreign_keys = ON');
}

// Migrates DBs from the "single meal_type/cuisine/protein column" era to the
// tag-based model: meal_type/cuisine become multi-value join tables
// (meal_types/meal_cuisines), and protein moves onto ingredients as a tag
// (ingredient_tags) rather than staying a meal-level column. Uses the same
// safe temp-table rebuild pattern as relaxTypeConstraints() above — meals is
// never renamed away, only dropped-and-replaced, so meal_ingredients and
// meal_history's foreign keys are never at risk of the rename-rewrite trap.
function migrateMealTagsAndProteins() {
  const cols = db.prepare('PRAGMA table_info(meals)').all().map((c) => c.name);
  const hasOldMealCols = ['cuisine', 'meal_type', 'protein'].every((c) => cols.includes(c));
  if (!hasOldMealCols) return;

  db.pragma('foreign_keys = OFF');

  // 1. Capture old column data before meals is rebuilt — this is the only
  // copy of cuisine/meal_type/protein that will exist once it's dropped.
  const oldMeals = db
    .prepare(
      `SELECT id, name, cuisine, meal_type, protein, notes, is_active, created_at, updated_at FROM meals`
    )
    .all();

  // 2. Safe rebuild of meals: temp table -> copy -> DROP original -> RENAME
  // temp into place. Never renames "meals" itself away.
  db.exec(`
    CREATE TABLE meals_new (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      notes       TEXT,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO meals_new (id, name, notes, is_active, created_at, updated_at)
      SELECT id, name, notes, is_active, created_at, updated_at FROM meals;
    DROP TABLE meals;
    ALTER TABLE meals_new RENAME TO meals;
    CREATE INDEX IF NOT EXISTS idx_meals_active ON meals(is_active);
  `);
  console.log('Rebuilt meals table (cuisine/meal_type/protein columns removed).');

  // 3. meal_types / meal_cuisines already exist (created by db.exec(schema)
  // above, brand new tables nothing referenced yet). Populate from the
  // captured single values.
  const insertType = db.prepare('INSERT OR IGNORE INTO meal_types (meal_id, type) VALUES (?, ?)');
  const insertCuisine = db.prepare('INSERT OR IGNORE INTO meal_cuisines (meal_id, cuisine) VALUES (?, ?)');
  for (const m of oldMeals) {
    if (m.meal_type && m.meal_type.trim()) insertType.run(m.id, m.meal_type.trim());
    if (m.cuisine && m.cuisine.trim()) insertCuisine.run(m.id, m.cuisine.trim());
  }

  // 4. Protein safety net (chicken/tofu only — 'none'/'other' never fed the
  // generator). Prefer tagging an already-linked ingredient whose name
  // contains the protein word; fall back to a generic shared ingredient so
  // classification survives even with no matching linked ingredient.
  const getLinked = db.prepare(
    `SELECT i.id, i.name FROM meal_ingredients mi JOIN ingredients i ON i.id = mi.ingredient_id WHERE mi.meal_id = ?`
  );
  const tagIngredient = db.prepare('INSERT OR IGNORE INTO ingredient_tags (ingredient_id, tag) VALUES (?, ?)');
  const findIngredientCI = db.prepare('SELECT id FROM ingredients WHERE LOWER(name) = LOWER(?)');
  const createIngredient = db.prepare('INSERT INTO ingredients (name, default_unit) VALUES (?, ?)');
  const linkGeneric = db.prepare(
    'INSERT OR IGNORE INTO meal_ingredients (meal_id, ingredient_id, quantity, unit) VALUES (?, ?, NULL, NULL)'
  );

  let proteinMigratedCount = 0;
  for (const m of oldMeals) {
    const protein = (m.protein || '').trim().toLowerCase();
    if (protein !== 'chicken' && protein !== 'tofu') continue;

    const linked = getLinked.all(m.id);
    const nameMatches = linked.filter((ing) => ing.name.toLowerCase().includes(protein));

    if (nameMatches.length > 0) {
      for (const ing of nameMatches) tagIngredient.run(ing.id, protein);
    } else {
      const label = protein === 'chicken' ? 'Chicken' : 'Tofu';
      let genericId = findIngredientCI.get(label)?.id;
      if (!genericId) genericId = createIngredient.run(label, 'g').lastInsertRowid;
      tagIngredient.run(genericId, protein);
      linkGeneric.run(m.id, genericId);
    }
    proteinMigratedCount++;
  }

  db.pragma('foreign_keys = ON');
  console.log(
    `Migrated ${oldMeals.length} meals to tagged types/cuisines; preserved protein classification for ${proteinMigratedCount} meal(s) via ingredient tags.`
  );
}

// Adds the meal profile-page columns (description, photo) to DBs created
// before they existed. Plain ALTER TABLE ADD COLUMN is safe here since these
// are new nullable columns, not a constraint/shape change like the rebuilds
// above.
function addMealProfileColumns() {
  const cols = db.prepare('PRAGMA table_info(meals)').all().map((c) => c.name);
  if (!cols.includes('description')) {
    db.exec('ALTER TABLE meals ADD COLUMN description TEXT');
    console.log('Added meals.description column.');
  }
  if (!cols.includes('photo')) {
    db.exec('ALTER TABLE meals ADD COLUMN photo TEXT');
    console.log('Added meals.photo column.');
  }
}

// Older DBs enforced a single UNIQUE(name) on ingredients, which blocked adding
// the same ingredient name under a different unit (e.g. "Garlic" by the head vs.
// by the clove) even though those are legitimately different catalog items.
// Rebuild to UNIQUE(name, default_unit) instead. Safe without a dedup pass: a
// plain UNIQUE(name) DB can't already contain two rows with the same name, so it
// trivially satisfies the new composite constraint too.
function relaxIngredientNameUniqueness() {
  const sql = tableSql('ingredients');
  const alreadyMigrated = sql && /UNIQUE\s*\(\s*name\s*,\s*default_unit\s*\)/i.test(sql);
  if (!sql || alreadyMigrated) return;

  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE ingredients_new (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      default_unit TEXT NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (name, default_unit)
    );
    INSERT INTO ingredients_new (id, name, default_unit, created_at)
      SELECT id, name, default_unit, created_at FROM ingredients;
    DROP TABLE ingredients;
    ALTER TABLE ingredients_new RENAME TO ingredients;
  `);
  db.pragma('foreign_keys = ON');
  console.log('Rebuilt ingredients table with UNIQUE(name, default_unit) instead of UNIQUE(name).');
}

relaxTypeConstraints();
migrateMealTagsAndProteins();
repairStaleForeignKeys();
addMealProfileColumns();
relaxIngredientNameUniqueness();

const fkIssues = db.pragma('foreign_key_check');
if (fkIssues.length > 0) {
  console.error('Foreign key check found issues after migration:', fkIssues);
  process.exitCode = 1;
} else {
  console.log('Migration complete.');
}
