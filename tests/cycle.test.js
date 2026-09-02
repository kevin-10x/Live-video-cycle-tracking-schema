import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCycle, cycleSchema, canonicalPlatformName } from '../src/schema/cycle.js';

const validCycle = {
  cycle_id: '7bb24274-4a46-43c7-b06f-34359aa66e05',
  video_fingerprint: 'b1163878928f664d8c1d960e7dbb83d215cf61a28686fef5cc0d7671cfcffd62',
  timestamp_utc: '2026-09-02T10:59:05.335Z',
  platforms: {
    youtube: {
      status: 'live',
      url: 'https://www.youtube.com/watch?v=abc123',
      variant_id: 'youtube-v1-standard',
      metrics_1h: { views: 1000, likes: 50, shares: 10, comments: 5 },
    },
  },
  errors: [],
  optimization_insights: [],
  next_cycle_recommendations: [],
};

test('accepts a well-formed cycle envelope', () => {
  const parsed = validateCycle(validCycle);
  assert.equal(parsed.cycle_id, validCycle.cycle_id);
});

test('rejects a non-sha256 video_fingerprint', () => {
  assert.throws(() => validateCycle({ ...validCycle, video_fingerprint: 'not-a-hash' }));
});

test('rejects a non-uuid cycle_id', () => {
  assert.throws(() => validateCycle({ ...validCycle, cycle_id: 'not-a-uuid' }));
});

test('per-field types are enforced by the schema', () => {
  assert.throws(() =>
    validateCycle({ ...validCycle, platforms: { youtube: { ...validCycle.platforms.youtube, metrics_1h: 'nope' } } })
  );
  assert.throws(() =>
    validateCycle({ ...validCycle, platforms: { youtube: { ...validCycle.platforms.youtube, status: 'bogus' } } })
  );
});

test('canonicalPlatformName normalizes aliases', () => {
  assert.equal(canonicalPlatformName('YT'), 'youtube');
  assert.equal(canonicalPlatformName('tt'), 'tiktok');
  assert.equal(canonicalPlatformName('twitter'), 'x');
  assert.equal(canonicalPlatformName('unknown'), null);
  assert.equal(canonicalPlatformName(undefined), null);
});

test('defaults are applied for optional arrays', () => {
  const { errors, next_cycle_recommendations } = cycleSchema.parse(validCycle);
  assert.deepEqual(errors, []);
  assert.deepEqual(next_cycle_recommendations, []);
});
