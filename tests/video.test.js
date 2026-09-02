import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintVideo, variantFor, durationFits, PLATFORM_VARIANTS } from '../src/utils/video.js';

const video = {
  file_path: '/tmp/foo.mp4',
  title: 'demo',
  duration: 60,
  width: 1080,
  height: 1920,
  fps: 30,
  audio_spec: 'aac 48k',
};

test('fingerprint is a stable 64-char sha256', () => {
  const a = fingerprintVideo(video);
  const b = fingerprintVideo(video);
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.notEqual(fingerprintVideo({ ...video, title: 'other' }), a);
});

test('variantFor produces per-platform variants', () => {
  const v = variantFor('youtube', 0);
  assert.equal(v.platform, 'youtube');
  assert.equal(v.id, 'youtube-v1-standard');
  assert.equal(variantFor('nope', 0), null);
});

test('every platform has a variant profile', () => {
  for (const p of PLATFORM_VARIANTS) {
    assert.ok(variantFor(p, 0), `missing variant for ${p}`);
  }
});

test('durationFits respects max duration', () => {
  assert.equal(durationFits(video, variantFor('tiktok', 1)), true); // 60s within 60s
  assert.equal(durationFits({ ...video, duration: 200 }, variantFor('tiktok', 1)), false);
});
