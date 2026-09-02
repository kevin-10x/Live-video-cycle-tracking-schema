import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeInsights, computeRecommendations } from '../src/engine/optimizer.js';

const mk = (status = 'live', m = {}) => ({ status, url: 'https://x.test', variant_id: 'v', metrics_1h: m });

test('computeInsights finds a breakout platform', () => {
  const insights = computeInsights({
    youtube: mk('live', { views: 30000, likes: 2000, shares: 500, comments: 100, retentionRate: 0.7, ctr: 0.1 }),
    tiktok: mk('live', { views: 3000, likes: 20, shares: 2, comments: 1, retentionRate: 0.2, ctr: 0.02 }),
  });
  const breakout = insights.find((i) => i.type === 'breakout');
  assert.ok(breakout, 'expected a breakout insight');
  assert.equal(breakout.platform, 'youtube');
});

test('computeInsights flags an underperformer and low retention', () => {
  const insights = computeInsights({
    youtube: mk('live', { views: 30000, likes: 2000, shares: 500, comments: 100, retentionRate: 0.8, ctr: 0.1 }),
    tiktok: mk('live', { views: 3000, likes: 20, shares: 2, comments: 1, retentionRate: 0.1, ctr: 0.02 }),
  });
  assert.ok(insights.some((i) => i.type === 'underperformer' && i.platform === 'tiktok'));
  assert.ok(insights.some((i) => i.type === 'retention' && i.platform === 'tiktok'));
});

test('computeInsights returns [] with no live platforms', () => {
  assert.deepEqual(computeInsights({}), []);
});

test('computeRecommendations suggests republish for a strong performer', () => {
  const recs = computeRecommendations({
    youtube: mk('live', { views: 20000, shares: 300 }),
    tiktok: mk('live', { views: 500, shares: 1 }),
  });
  assert.ok(recs.some((r) => r.action === 'republish' && r.platform === 'youtube'));
});

test('computeRecommendations asks to retry failed pubs', () => {
  const recs = computeRecommendations({ youtube: mk('failed') });
  assert.ok(recs.some((r) => r.action === 'retry' && r.platform === 'youtube'));
});

test('computeRecommendations returns a hold fallback when silent', () => {
  const recs = computeRecommendations({ youtube: mk('live', { views: 100, likes: 1 }) });
  assert.ok(recs.length > 0);
});
