import { run, all } from '../db/index.js';

export async function runMigrations() {
  await run(`CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    file_path TEXT NOT NULL DEFAULT '',
    duration REAL NOT NULL DEFAULT 0,
    width INTEGER NOT NULL DEFAULT 1920,
    height INTEGER NOT NULL DEFAULT 1080,
    fps INTEGER NOT NULL DEFAULT 30,
    audio_spec TEXT NOT NULL DEFAULT 'aac 48k',
    video_fingerprint TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  await run(`CREATE TABLE IF NOT EXISTS cycles (
    id TEXT PRIMARY KEY,
    video_id INTEGER REFERENCES videos(id),
    video_fingerprint TEXT NOT NULL DEFAULT '',
    timestamp_utc TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    errors_json TEXT NOT NULL DEFAULT '[]',
    insights_json TEXT NOT NULL DEFAULT '[]',
    recommendations_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  await run(`CREATE TABLE IF NOT EXISTS pubs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle_id TEXT NOT NULL REFERENCES cycles(id),
    platform TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    url TEXT NOT NULL DEFAULT '',
    variant_id TEXT NOT NULL DEFAULT '',
    external_id TEXT NOT NULL DEFAULT '',
    error TEXT,
    published_at TEXT,
    metrics_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  await migrateExistingDatabases();
}

// CREATE TABLE IF NOT EXISTS never alters a table that already exists, so a
// database created by an earlier version keeps the old column constraints after
// a deploy. A volume-backed production database is exactly that case, so the
// fixes are applied as explicit rebuilds below.
async function migrateExistingDatabases() {
  await addMissingColumn('cycles', 'video_fingerprint', "TEXT NOT NULL DEFAULT ''");

  // cycles.video_id used to be NOT NULL, which rejected inline-video cycles
  // (no stored video row). SQLite cannot drop a NOT NULL constraint in place,
  // so rebuild the table when the old definition is found.
  const info = await all(`PRAGMA table_info(cycles)`);
  const videoId = info.find((c) => c.name === 'video_id');
  if (videoId && videoId.notnull === 1) {
    await run(`PRAGMA foreign_keys = OFF`);
    await run(`BEGIN`);
    try {
      await run(`CREATE TABLE cycles_new (
        id TEXT PRIMARY KEY,
        video_id INTEGER REFERENCES videos(id),
        video_fingerprint TEXT NOT NULL DEFAULT '',
        timestamp_utc TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        errors_json TEXT NOT NULL DEFAULT '[]',
        insights_json TEXT NOT NULL DEFAULT '[]',
        recommendations_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      await run(`INSERT INTO cycles_new
        (id, video_id, video_fingerprint, timestamp_utc, status,
         errors_json, insights_json, recommendations_json, created_at)
        SELECT id, video_id, COALESCE(video_fingerprint, ''), timestamp_utc, status,
               errors_json, insights_json, recommendations_json, created_at
        FROM cycles`);
      await run(`DROP TABLE cycles`);
      await run(`ALTER TABLE cycles_new RENAME TO cycles`);
      await run(`COMMIT`);
    } catch (e) {
      await run(`ROLLBACK`);
      throw e;
    } finally {
      await run(`PRAGMA foreign_keys = ON`);
    }
  }
}

async function addMissingColumn(table, column, definition) {
  const info = await all(`PRAGMA table_info(${table})`);
  if (info.some((c) => c.name === column)) return;
  await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export const migrationReady = runMigrations();
