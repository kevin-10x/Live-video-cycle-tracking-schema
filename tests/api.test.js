import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

process.env.DB_PATH = path.join(os.tmpdir(), `vp-test-${Date.now()}.db`);

const { default: app } = await import('../src/app.js');
import { storeVideo } from '../src/utils/store.js';
import { fingerprintVideo } from '../src/utils/video.js';

let server;
let base;
let videoId;

before(async () => {
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
