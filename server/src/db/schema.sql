CREATE TABLE IF NOT EXISTS meals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT,
  notes       TEXT,
  photo       TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_meals_active ON meals(is_active);

CREATE TABLE IF NOT EXISTS meal_types (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_id  INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  type     TEXT NOT NULL COLLATE NOCASE,
  UNIQUE (meal_id, type)
);
CREATE INDEX IF NOT EXISTS idx_meal_types_meal ON meal_types(meal_id);
CREATE INDEX IF NOT EXISTS idx_meal_types_type ON meal_types(type);

CREATE TABLE IF NOT EXISTS meal_cuisines (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_id  INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  cuisine  TEXT NOT NULL COLLATE NOCASE,
  UNIQUE (meal_id, cuisine)
);
CREATE INDEX IF NOT EXISTS idx_meal_cuisines_meal ON meal_cuisines(meal_id);
CREATE INDEX IF NOT EXISTS idx_meal_cuisines_cuisine ON meal_cuisines(cuisine);

-- Identity is (name, default_unit), not name alone: "Garlic" bought/measured as
-- cloves vs. as heads are different catalog items, so both may exist. A recipe's
-- own measurement (meal_ingredients.unit) is independent of this and free-form
-- regardless — e.g. garlic can still be added to a meal "by the cup" without a
-- matching catalog row.
CREATE TABLE IF NOT EXISTS ingredients (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  default_unit TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (name, default_unit)
);

CREATE TABLE IF NOT EXISTS ingredient_tags (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_id  INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  tag            TEXT NOT NULL COLLATE NOCASE,
  UNIQUE (ingredient_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_ingredient_tags_ingredient ON ingredient_tags(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_ingredient_tags_tag ON ingredient_tags(tag);

CREATE TABLE IF NOT EXISTS meal_ingredients (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_id       INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity      REAL,
  unit          TEXT,
  UNIQUE (meal_id, ingredient_id)
);
CREATE INDEX IF NOT EXISTS idx_meal_ingredients_meal ON meal_ingredients(meal_id);
CREATE INDEX IF NOT EXISTS idx_meal_ingredients_ingredient ON meal_ingredients(ingredient_id);

CREATE TABLE IF NOT EXISTS meal_instructions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_id      INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  step         INTEGER NOT NULL,
  instruction  TEXT NOT NULL,
  UNIQUE (meal_id, step)
);
CREATE INDEX IF NOT EXISTS idx_meal_instructions_meal ON meal_instructions(meal_id);

CREATE TABLE IF NOT EXISTS meal_history (
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
CREATE INDEX IF NOT EXISTS idx_meal_history_date ON meal_history(date);
CREATE INDEX IF NOT EXISTS idx_meal_history_status ON meal_history(status);
CREATE INDEX IF NOT EXISTS idx_meal_history_plan_batch ON meal_history(plan_batch_id);
