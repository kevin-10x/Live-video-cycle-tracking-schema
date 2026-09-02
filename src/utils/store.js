import { all, get, run } from '../db/index.js';
import { validateCycle } from '../schema/cycle.js';

export async function listCycles({ limit = 20, offset = 0 } = {}) {
  const totalRow = await get('SELECT COUNT(*) as total FROM cycles');
  const rows = await all(
    'SELECT * FROM cycles ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [limit, offset]
  );
  const cycles = [];
  for (const row of rows) {
    cycles.push(await buildCycle(row));
  }
  return { cycles, total: totalRow.total };
}

export async function getCycle(id) {
  const row = await get('SELECT * FROM cycles WHERE id = ?', [id]);
  if (!row) return null;
  return buildCycle(row);
}

async function buildCycle(row) {
  const pubs = await all('SELECT * FROM pubs WHERE cycle_id = ?', [row.id]);
  const platforms = {};
  for (const p of pubs) {
    platforms[p.platform] = {
      status: p.status,
      url: p.url,
      variant_id: p.variant_id,
      metrics_1h: JSON.parse(p.metrics_json || '{}'),
    };
  }
  const cycle = {
    cycle_id: row.id,
    video_fingerprint: row.video_fingerprint,
    timestamp_utc: row.timestamp_utc,
    platforms,
    errors: JSON.parse(row.errors_json || '[]'),
    optimization_insights: JSON.parse(row.insights_json || '[]'),
    next_cycle_recommendations: JSON.parse(row.recommendations_json || '[]'),
  };
  // Normalize on read so stored data always satisfies the schema.
  return validateCycle(cycle);
}

export async function storeVideo(video) {
  const r = await run(
    `INSERT INTO videos (title, description, tags, file_path, duration, width, height, fps, audio_spec, video_fingerprint)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      video.title,
      video.description || '',
      JSON.stringify(video.tags || []),
      video.file_path || '',
      video.duration || 0,
      video.width || 1920,
      video.height || 1080,
      video.fps || 30,
      video.audio_spec || 'aac 48k',
      video.video_fingerprint || '',
    ]
  );
  return { id: r.lastID };
}

export async function listVideos() {
  return all('SELECT * FROM videos ORDER BY created_at DESC');
}

export async function getVideo(id) {
  const row = await get('SELECT * FROM videos WHERE id = ?', [id]);
  if (!row) return null;
  row.tags = JSON.parse(row.tags || '[]');
  return row;
}

export async function recordCycle(id, status, errors, insights, recommendations) {
  await run(
    'UPDATE cycles SET status = ?, errors_json = ?, insights_json = ?, recommendations_json = ? WHERE id = ?',
    [
      status,
      JSON.stringify(errors),
      JSON.stringify(insights),
      JSON.stringify(recommendations),
      id,
    ]
  );
}