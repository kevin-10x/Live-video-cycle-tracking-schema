import { run } from '../db/index.js';

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
    video_id INTEGER NOT NULL REFERENCES videos(id),
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
}

export const migrationReady = runMigrations();
