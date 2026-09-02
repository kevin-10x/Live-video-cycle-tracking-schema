import { z } from 'zod';

// ---------------------------------------------------------------------------
// The cycle JSON contract. This is the exact envelope the user specified.
// ---------------------------------------------------------------------------

export const platformStatusSchema = z.enum(['live', 'published', 'failed', 'processing', 'skipped']);

export const metricsSchema = z.object({
  views: z.number().int().nonnegative().optional(),
  likes: z.number().int().nonnegative().optional(),
  shares: z.number().int().nonnegative().optional(),
  comments: z.number().int().nonnegative().optional(),
  watchTime: z.number().nonnegative().optional(), // seconds
  avgViewDuration: z.number().nonnegative().optional(), // seconds
  retentionRate: z.number().min(0).max(1).optional(), // 0..1
  ctr: z.number().min(0).max(1).optional(), // click-through rate 0..1
}).passthrough();

const platformEntrySchema = z.object({
  status: platformStatusSchema,
  url: z.string().url(),
  variant_id: z.string(),
  metrics_1h: metricsSchema,
});

const errorSchema = z.object({
  platform: z.string(),
  message: z.string(),
  code: z.string().optional(),
  retryable: z.boolean().optional(),
});

const insightSchema = z.object({
  type: z.enum(['winner', 'underperformer', 'retention', 'breakout', 'edit', 'reverse']),
  platform: z.string().optional(),
  message: z.string(),
  metric: z.string().optional(),
});

const recommendationSchema = z.object({
  action: z.enum(['republish', 'retry', 'drop', 'hold', 'variant_change', 'pause']),
  platform: z.string().optional(),
  reason: z.string(),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
});

export const cycleSchema = z.object({
  cycle_id: z.string().uuid(),
  video_fingerprint: z.string().regex(/^[a-f0-9]{64}$/, 'must be a sha256 hex digest'),
  timestamp_utc: z.string().datetime({ offset: true }),
  platforms: z.record(
    z.enum(['youtube', 'tiktok', 'instagram', 'x', 'facebook']),
    platformEntrySchema
  ),
  errors: z.array(errorSchema).default([]),
  optimization_insights: z.array(insightSchema).default([]),
  next_cycle_recommendations: z.array(recommendationSchema).default([]),
});

export function validateCycle(cycle) {
  return cycleSchema.parse(cycle);
}

export function validateCycles(cycles) {
  return z.array(cycleSchema).parse(cycles);
}

// ---------------------------------------------------------------------------
// Format helpers to keep emitted JSON canonical.
// ---------------------------------------------------------------------------

export function isoNow() {
  return new Date().toISOString();
}

export function canonicalPlatformName(name) {
  const map = {
    youtube: 'youtube',
    yt: 'youtube',
    tiktok: 'tiktok',
    tt: 'tiktok',
    instagram: 'instagram',
    ig: 'instagram',
    x: 'x',
    twitter: 'x',
    facebook: 'facebook',
    fb: 'facebook',
  };
  return map[(name || '').toLowerCase()] || null;
}
