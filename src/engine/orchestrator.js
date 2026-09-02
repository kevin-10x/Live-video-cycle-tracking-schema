import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { getAdapter, registeredPlatforms, adapterConfigured } from '../adapters/index.js';
import { canonicalPlatformName } from '../schema/cycle.js';
import { computeInsights, computeRecommendations } from './optimizer.js';
import { fingerprintVideo, variantFor, PLATFORM_VARIANTS, durationFits } from '../utils/video.js';
import { run as dbRun } from '../db/index.js';

function uuid() {
  return crypto.randomUUID();
}

// The orchestrator drives the full cycle lifecycle:
//   create -> publish (per platform) -> collect metrics -> insight/recommend
// and returns the exact JSON envelope defined in src/schema/cycle.js.

async function persistCycle(cycle) {
  await dbRun(
    `INSERT INTO cycles (id, video_id, video_fingerprint, timestamp_utc, status, errors_json, insights_json, recommendations_json)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      cycle.cycle_id,
      cycle.video_id || null,
      cycle.video_fingerprint || '',
      cycle.timestamp_utc,
      cycle.status || 'published',
      JSON.stringify(cycle.errors || []),
      JSON.stringify(cycle.optimization_insights || []),
      JSON.stringify(cycle.next_cycle_recommendations || []),
    ]
  );
  for (const [platform, p] of Object.entries(cycle.platforms)) {
    await dbRun(
      `INSERT INTO pubs (cycle_id, platform, status, url, variant_id, external_id, error, published_at, metrics_json)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        cycle.cycle_id,
        platform,
        p.status,
        p.url || '',
        p.variant_id || '',
        p.external_id || '',
        p.error || null,
        p.published_at || null,
        JSON.stringify(p.metrics_1h || {}),
      ]
    );
  }
}

// Main entry: run a full publish cycle for a video across platforms.
export async function runCycle(video, { platforms, video_id } = {}) {
  const platformList = (platforms && platforms.length ? platforms : registeredPlatforms())
    .map(canonicalPlatformName)
    .filter(Boolean);

  const fingerprint = video.video_fingerprint || fingerprintVideo(video);
  const cycleId = uuid();
  const timestamp_utc = new Date().toISOString();

  const cycle = {
    cycle_id: cycleId,
    video_fingerprint: fingerprint,
    timestamp_utc,
    platforms: {},
    errors: [],
    optimization_insights: [],
    next_cycle_recommendations: [],
    video_id: video_id || video.id || null,
    status: 'published',
  };

  for (const platform of platformList) {
    const adapter = getAdapter(platform);
    const index = platformList.indexOf(platform);
    const variant = variantFor(platform, index);

    try {
      if (!adapter) throw new Error(`No adapter registered for "${platform}"`);
      const pub = await adapter.publish({ video, variant });
      const entry = {
        status: 'live',
        url: pub.url,
        variant_id: variant.id,
        metrics_1h: {},
      };
      // Collect first-hour metrics.
      const metrics = await adapter.fetchMetrics();
      if (adapter.setExternalId) adapter.setExternalId(pub.external_id);
      entry.metrics_1h = {
        ...metrics,
        _simulated: adapter.simulated,
      };

      cycle.platforms[platform] = entry;
    } catch (e) {
      cycle.platforms[platform] = {
        status: 'failed',
        url: '',
        variant_id: variant ? variant.id : '',
        metrics_1h: {},
      };
      cycle.errors.push({
        platform,
        message: e.message || 'Publish failed',
        code: e.code,
        retryable: e.retryable,
      });
    }
  }

  // Optimization pass.
  cycle.optimization_insights = computeInsights(cycle.platforms);
  cycle.next_cycle_recommendations = computeRecommendations(cycle.platforms, {
    configured: adapterConfigured,
  });

  const hasSuccess = Object.values(cycle.platforms).some(
    (p) => p.status === 'live' || p.status === 'published'
  );
  if (!hasSuccess && cycle.platforms && cycle.errors.length) {
    cycle.status = 'failed';
  }

  await persistCycle(cycle);

  // Strip internal fields before returning the public envelope.
  const {
    video_id: _v,
    status: _s,
    ...publicCycle
  } = cycle;
  return publicCycle;
}

// Republish: run a new cycle for an existing video (a "repost").
export async function repostCycle(video, { platforms, video_id } = {}) {
  return runCycle(video, { platforms, video_id });
}

// Convenience: build cycle envelope for a video already in DB.
export async function createCycleForVideo(row, opts = {}) {
  const video = {
    ...row,
    tags: Array.isArray(row.tags) ? row.tags : JSON.parse(row.tags || '[]'),
  };
  return runCycle(video, { platforms: opts.platforms, video_id: row.id });
}

export { registeredPlatforms, PLATFORM_VARIANTS, durationFits, config };