import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// DB_PATH must be set BEFORE any module reads it. ESM hoists static imports
// above top-level statements, so assigning here and importing afterwards would
// be too late -- config would fall back to data/video-pipeline.db and the test
// would run against (and pollute) the development database.
const testDb = path.join(os.tmpdir(), `vp-test-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = testDb;

const { default: app } = await import('../src/app.js');
const { migrationReady } = await import('../src/db/migrate.js');
const { storeVideo } = await import('../src/utils/store.js');
const { fingerprintVideo } = await import('../src/utils/video.js');

after(() => {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    fs.rmSync(testDb + suffix, { force: true });
  }
});

let server;
let base;
let videoId;

before(async () => {
  // Migrations run asynchronously on import; querying before they finish fails
  // with "no such table".
  await migrationReady;

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  const video = {
    title: 'Integration test clip',
    description: 'desc',
    tags: ['test'],
    file_path: 'https://cdn.example.com/integration.mp4',
    duration: 30,
    width: 1080,
    height: 1920,
    fps: 30,
    audio_spec: 'aac 48k',
  };
  video.video_fingerprint = fingerprintVideo(video);
  videoId = (await storeVideo(video)).id;
});

after(() => server && server.close());

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
}

test('runs a full publish cycle and returns a schema-valid envelope', async () => {
  const { status, json } = await call('POST', '/api/cycles', { video_id: videoId });
  assert.equal(status, 201);
  const cycle = json.data;
  assert.ok(cycle.cycle_id);
  assert.equal(cycle.video_fingerprint.length, 64);
  assert.ok(Object.keys(cycle.platforms).length >= 1);
  // every platform entry has status, url, variant_id, metrics_1h
  for (const entry of Object.values(cycle.platforms)) {
    assert.ok(['live', 'failed', 'published'].includes(entry.status));
    assert.equal(typeof entry.variant_id, 'string');
    assert.equal(typeof entry.metrics_1h, 'object');
  }
  // recommendations are non-empty and prioritized
  assert.ok(cycle.next_cycle_recommendations.length >= 1);
  assert.ok(cycle.next_cycle_recommendations.every((r) => r.priority));
});

test('runs a publish cycle for an INLINE video (no stored video_id)', async () => {
  // Regression: cycles.video_id was NOT NULL, so posting an inline video —
  // the documented request shape — failed with a 500 constraint error.
  const { status, json } = await call('POST', '/api/cycles', {
    video: {
      title: 'Inline video',
      file_path: 'https://cdn.example.com/inline.mp4',
      duration: 30,
      width: 1080,
      height: 1920,
      fps: 30,
    },
  });
  assert.equal(status, 201, JSON.stringify(json));
  assert.ok(json.data.cycle_id);
  assert.equal(json.data.video_fingerprint.length, 64);
});

test('a cycle created from an inline video can be listed and fetched', async () => {
  const created = await call('POST', '/api/cycles', {
    video: { title: 'Listable', file_path: 'https://cdn.example.com/l.mp4', duration: 20 },
  });
  const id = created.json.data.cycle_id;
  const list = await call('GET', '/api/cycles');
  const found = list.json.data.find((c) => c.cycle_id === id);
  assert.ok(found, 'inline cycle should be persisted and listed');
  const one = await call('GET', `/api/cycles/${id}`);
  assert.equal(one.status, 200);
  assert.equal(one.json.data.cycle_id, id);
});

test('rejects a cycle request with neither video nor video_id', async () => {
  const { status } = await call('POST', '/api/cycles', {});
  assert.equal(status, 400);
});

test('lists cycles from the API', async () => {
  const { status, json } = await call('GET', '/api/cycles');
  assert.equal(status, 200);
  assert.ok(json.meta.total >= 1);
  const first = json.data[0];
  assert.ok(first.cycle_id);
  assert.equal(typeof first.video_fingerprint, 'string');
});

test('fetches a single cycle by id', async () => {
  const list = await call('GET', '/api/cycles');
  const id = list.json.data[0].cycle_id;
  const { status, json } = await call('GET', `/api/cycles/${id}`);
  assert.equal(status, 200);
  assert.equal(json.data.cycle_id, id);
});

test('reposts a video into a new cycle', async () => {
  const { status, json } = await call('POST', `/api/cycles/${videoId}/repost`, {});
  assert.equal(status, 201);
  assert.ok(json.data.cycle_id);
});

test('validates cycle JSON via the validate endpoint', async () => {
  const bad = await call('POST', '/api/cycles/validate', { cycle_id: 'nope' });
  assert.equal(bad.status, 400);
  const list = await call('GET', '/api/cycles');
  const good = list.json.data[0];
  const okRes = await call('POST', '/api/cycles/validate', good);
  assert.equal(okRes.status, 200);
  assert.equal(okRes.json.data.valid, true);
});

// --- Regression tests for defects found during review ---------------------

test('adapters hold no per-request state on the shared instance', async () => {
  const { getAdapter } = await import('../src/adapters/index.js');
  const adapter = getAdapter('youtube');
  // getAdapter returns a singleton, so any external id stashed on the instance
  // would be clobbered by a concurrent cycle. fetchMetrics takes it per call.
  assert.equal(typeof adapter.fetchMetrics, 'function');
  assert.ok(!('_externalId' in adapter), 'adapter must not accumulate external ids');
  assert.equal(typeof adapter.setExternalId, 'undefined', 'setExternalId should be removed');
});

test('fetchMetrics receives the external id of the item just published', async () => {
  const { getAdapter } = await import('../src/adapters/index.js');
  const { runCycle } = await import('../src/engine/orchestrator.js');
  const seen = [];
  const adapter = getAdapter('youtube');
  const original = adapter.fetchMetrics.bind(adapter);
  adapter.fetchMetrics = async (id) => {
    seen.push(id);
    return original(id);
  };
  try {
    const cycle = await runCycle({ title: 'id plumbing', file_path: 'f.mp4', duration: 5 });
    const publishedId = cycle.platforms.youtube.url.split('v=')[1];
    assert.ok(publishedId, 'a youtube url must be produced');
    assert.ok(seen.includes(publishedId), 'fetchMetrics must be given the published external id');
  } finally {
    adapter.fetchMetrics = original;
  }
});

test('concurrent cycles each pass their own external id to fetchMetrics', async () => {
  const { getAdapter } = await import('../src/adapters/index.js');
  const { runCycle } = await import('../src/engine/orchestrator.js');
  const adapter = getAdapter('youtube');
  const received = [];
  const original = adapter.fetchMetrics.bind(adapter);
  adapter.fetchMetrics = async (id) => {
    // Yield so the cycles genuinely overlap rather than running one at a time.
    await new Promise((r) => setImmediate(r));
    received.push(id);
    return original(id);
  };
  try {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        runCycle({ title: `concurrent ${i}`, file_path: `c${i}.mp4`, duration: 5 })
      )
    );
    const ownIds = results.map((c) => c.platforms.youtube.url.split('v=')[1]);
    assert.equal(new Set(ownIds).size, 6, 'each cycle must publish a distinct id');
    assert.equal(received.length, 6, 'fetchMetrics runs once per cycle');
    // The id is threaded through as an argument, so it cannot be reassigned by
    // an interleaved cycle. This is the property that makes the shared-instance
    // race impossible rather than merely unlikely.
    assert.deepEqual(
      [...received].sort(),
      [...ownIds].sort(),
      'each cycle must pass the id of the video it just published'
    );
  } finally {
    adapter.fetchMetrics = original;
  }
});

test('GET /api/cycles/platforms is not shadowed by the /:id route', async () => {
  const { status, json } = await call('GET', '/api/cycles/platforms');
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.data));
  assert.ok(json.data.includes('youtube'));

  // Static paths must be registered before the '/:id' catch-all, otherwise a
  // future static route silently becomes "Cycle not found".
  const bogus = await call('GET', '/api/cycles/definitely-not-a-real-id');
  assert.equal(bogus.status, 404);
  assert.equal(bogus.json.error, 'Cycle not found');
});

test('a corrupt stored row does not break the whole list endpoint', async () => {
  const { run, get } = await import('../src/db/index.js');
  const good = '22222222-2222-4222-8222-222222222222';
  const bad = 'corrupt-cycle-row';
  await run(
    'INSERT INTO cycles (id,video_fingerprint,timestamp_utc,status) VALUES (?,?,?,?)',
    [good, 'a'.repeat(64), new Date().toISOString(), 'published']
  );
  await run(
    'INSERT INTO cycles (id,video_fingerprint,timestamp_utc,status) VALUES (?,?,?,?)',
    [bad, 'too-short', new Date().toISOString(), 'published']
  );

  const { status, json } = await call('GET', '/api/cycles?limit=100');
  assert.equal(status, 200, 'a bad row must not 500 the list endpoint');
  assert.ok(json.data.some((c) => c.cycle_id === good), 'valid rows must still be returned');
  // The skipped row is reported rather than silently dropped.
  assert.ok(Array.isArray(json.meta.skipped), 'skipped rows must be surfaced in meta');
  assert.ok(json.meta.skipped.some((s) => s.cycle_id === bad));
});

test('unexpected errors do not leak internals to the client', async () => {
  // Fetching the corrupt row directly triggers an unhandled schema failure.
  const { status, json } = await call('GET', '/api/cycles/corrupt-cycle-row');
  assert.equal(status, 500);
  assert.equal(json.error, 'Internal server error');
  // No stack, no zod issue paths, no filesystem paths.
  const serialised = JSON.stringify(json);
  assert.ok(!serialised.includes('node_modules'), 'must not expose dependency paths');
  assert.ok(!/\/home\/|\/app\/|at Object|\.js:\d+/.test(serialised), 'must not expose paths or stack frames');
});

test('authored 4xx messages are still returned to the client', async () => {
  const missing = await call('GET', '/api/cycles/definitely-missing');
  assert.equal(missing.status, 404);
  assert.equal(missing.json.error, 'Cycle not found');

  const noBody = await call('POST', '/api/cycles', {});
  assert.equal(noBody.status, 400);
  assert.equal(noBody.json.error, 'Provide a video or video_id');

  const badPlatforms = await call('POST', '/api/cycles', { video: { title: 't' }, platforms: 'nope' });
  assert.equal(badPlatforms.status, 400);
  assert.equal(badPlatforms.json.error, 'platforms must be an array');
});

test('the _simulated flag reflects whether metrics are real', async () => {
  const { getAdapter } = await import('../src/adapters/index.js');
  const { runCycle } = await import('../src/engine/orchestrator.js');
  const adapter = getAdapter('youtube');

  // No credentials -> everything is simulated, and that must be flagged.
  const cycle = await runCycle({ title: 'sim flag', file_path: 'f.mp4', duration: 5 }, { platforms: ['youtube'] });
  assert.equal(cycle.platforms.youtube.metrics_1h._simulated, true, 'unconfigured adapters must flag simulation');
  assert.equal(cycle.errors.length, 0, 'a deliberately simulated cycle is not an error');
});

test('a real metrics call that fails is recorded, not silently faked', async () => {
  const { getAdapter } = await import('../src/adapters/index.js');
  const { runCycle } = await import('../src/engine/orchestrator.js');
  const adapter = getAdapter('youtube');
  const originalPublish = adapter.publish.bind(adapter);
  const originalConfigured = adapter.isConfigured.bind(adapter);
  const originalFetch = globalThis.fetch;

  adapter.isConfigured = () => true; // pretend credentials exist
  adapter.publish = async ({ variant }) => ({
    url: 'https://www.youtube.com/watch?v=real-id-123',
    external_id: 'real-id-123',
    variant_id: variant.id,
  });
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });

  try {
    const cycle = await runCycle({ title: 'real fail', file_path: 'f.mp4', duration: 5 }, { platforms: ['youtube'] });
    const entry = cycle.errors.find((e) => e.code === 'METRICS_UNAVAILABLE');
    assert.ok(entry, 'a failed real metrics call must appear in cycle.errors');
    assert.equal(entry.platform, 'youtube');
    assert.match(entry.message, /503/);
    assert.equal(cycle.platforms.youtube.metrics_1h._simulated, true, 'fallback numbers are still simulated');
  } finally {
    adapter.publish = originalPublish;
    adapter.isConfigured = originalConfigured;
    globalThis.fetch = originalFetch;
  }
});
