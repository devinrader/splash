CREATE TABLE IF NOT EXISTS chemical_additions (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL,
  chemical_type TEXT NOT NULL,
  amount REAL NOT NULL,
  unit TEXT NOT NULL,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  recorded_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (
    chemical_type IN (
      'liquid_chlorine',
      'cal_hypo',
      'trichlor',
      'dichlor',
      'muriatic_acid',
      'soda_ash',
      'baking_soda',
      'calcium_chloride',
      'stabilizer',
      'salt',
      'algaecide',
      'other'
    )
  ),
  CHECK (amount > 0),
  CHECK (unit IN ('gal', 'qt', 'oz', 'lb', 'kg', 'g', 'L')),
  CHECK (source IN ('manual'))
);

CREATE INDEX IF NOT EXISTS idx_chemical_additions_pool_recorded_at
  ON chemical_additions (pool_id, recorded_at DESC, created_at DESC);
