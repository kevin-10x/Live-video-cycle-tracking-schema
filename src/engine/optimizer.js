// Optimization engine: consumes per-platform metrics for a cycle and produces
//  1) optimization_insights  — what the data says about this cycle
//  2) next_cycle_recommendations — what to do next (republish/retry/drop/...)

// Engagement is a composite used to compare platforms fairly. Weighted blend of
// like/comment/share activity relative to views, plus retention and CTR.
function engagementScore(m) {
  if (!m) return 0;
  const views = m.views || 0;
  const interactions = (m.likes || 0) + (m.comments || 0) * 3 + (m.shares || 0) * 5;
  const interactionRate = views > 0 ? interactions / views : 0;
  const retention = m.retentionRate != null ? m.retentionRate : 0.5;
  const ctr = m.ctr != null ? m.ctr : 0.05;
  const viewsBoost = views > 10000 ? 1.25 : views > 1000 ? 1.1 : 1;
  return +(interactionRate * 10 * viewsBoost + retention * 3 + ctr * 10).toFixed(4);
}

function maxBy(entries, scoreFn) {
  return entries.reduce(
    (best, e) => (scoreFn(e) > scoreFn(best) ? e : best),
    entries[0]
  );
}

// Build the optimization insights for a completed cycle.
export function computeInsights(platforms) {
  const insights = [];
  const entries = Object.entries(platforms)
    .filter(([, p]) => p.status === 'live' || p.status === 'published')
    .map(([platform, p]) => ({ platform, ...p, score: engagementScore(p.metrics_1h) }));

  if (entries.length === 0) return insights;

  const best = maxBy(entries, (e) => e.score);
  const worst = maxBy(entries, (e) => -e.score);

  // Breakout performer.
  const bestMetrics = best.metrics_1h || {};
  if (bestMetrics.views > 0 && (bestMetrics.views > 10000 || best.score >= 1)) {
    insights.push({
      type: 'breakout',
      platform: best.platform,
      metric: 'views',
      message: `"${best.platform}" is a breakout: ${bestMetrics.views} views in the first hour.`,
    });
  } else if (entries.length > 1) {
    insights.push({
      type: 'winner',
      platform: best.platform,
      metric: 'engagement',
      message: `"${best.platform}" leads the cycle with the highest engagement score (${best.score}).`,
    });
  }

  // Underperformer (only when more than one platform so comparison is fair).
  if (entries.length > 1 && worst.platform !== best.platform) {
    const ratio = best.score > 0 ? worst.score / best.score : 0;
    if (ratio < 0.5) {
      insights.push({
        type: 'underperformer',
        platform: worst.platform,
        metric: 'engagement',
        message: `"${worst.platform}" underperformed at ${(ratio * 100).toFixed(0)}% of the leading platform's engagement.`,
      });
    }
  }

  // Retention red flag.
  const lowRetention = entries.filter((e) => {
    const r = e.metrics_1h && e.metrics_1h.retentionRate;
    return typeof r === 'number' && r < 0.3;
  });
  for (const e of lowRetention) {
    insights.push({
      type: 'retention',
      platform: e.platform,
      metric: 'retentionRate',
      message: `Low retention (${((e.metrics_1h.retentionRate) * 100).toFixed(0)}%) on "${e.platform}" — consider a tighter hook or shorter edit.`,
    });
  }

  // Edit suggestion for vertical/short platforms.
  const short = entries.find((e) => ['tiktok', 'instagram'].includes(e.platform));
  const long = entries.find((e) => ['youtube', 'facebook'].includes(e.platform));
  if (short && long && long.metrics_1h && short.metrics_1h) {
    if (long.metrics_1h.avgViewDuration > 15 && short.metrics_1h.avgViewDuration <= 8) {
      insights.push({
        type: 'edit',
        platform: short.platform,
        metric: 'avgViewDuration',
        message: 'Short-form viewers drop quickly; re-cut the vertical with a faster intro.',
      });
    }
  }

  // Reverse repurpose suggestion: winner as raw material on other platforms.
  if (entries.length > 1 && best.metrics_1h && best.metrics_1h.views > 2000) {
    insights.push({
      type: 'reverse',
      platform: best.platform,
      metric: 'views',
      message: `Reuse "${best.platform}"'s winning edit as the base cut for the next repost cycle.`,
    });
  }

  return insights;
}

// Build next-cycle recommendations (actionable, persisted in the cycle JSON).
export function computeRecommendations(platforms, { configured = () => false } = {}) {
  const recs = [];
  const entries = Object.entries(platforms).map(([platform, p]) => ({
    platform,
    status: p.status,
    metrics: p.metrics_1h || {},
    score: engagementScore(p.metrics_1h || {}),
  }));

  const failed = entries.filter((e) => e.status === 'failed');
  const live = entries.filter((e) => e.status === 'live' || e.status === 'published');
  const skipped = entries.filter((e) => e.status === 'skipped');

  // Retry failed, if they are retryable or just weren't configured.
  for (const e of failed) {
    if (configured(e.platform) || !e.status) {
      recs.push({
        action: 'retry',
        platform: e.platform,
        reason: `Publication to "${e.platform}" failed this cycle.`,
        priority: 'high',
      });
    } else {
      recs.push({
        action: 'retry',
        platform: e.platform,
        reason: `"${e.platform}" was skipped; add credentials and re-run to include it.`,
        priority: 'medium',
      });
    }
  }

  // Publisher-native recommendations.
  if (live.length > 1) {
    const best = maxBy(live, (e) => e.score);
    const worst = maxBy(live, (e) => -e.score);
    if (best.score > worst.score * 1.5 && best.score > 0) {
      recs.push({
        action: 'variant_change',
        platform: worst.platform,
        reason: `Adopt "${best.platform}"'s winning format on the weaker "${worst.platform}".`,
        priority: 'medium',
      });
    }
  }

  // Republish the best performer on its own platform (repost cadence).
  if (live.length) {
    const best = maxBy(live, (e) => e.score);
    const m = best.metrics;
    if (m.views > 0 && (m.views >= 5000 || (m.shares || 0) >= 100)) {
      recs.push({
        action: 'republish',
        platform: best.platform,
        reason: `"${best.platform}" cleared a high bar (${m.views} views); schedule a repost next cycle.`,
        priority: 'high',
      });
    }
  }

  // Anything with an abysmal floor under no competition -> hold.
  if (!skipped.length && !failed.length && live.length && entries.every((e) => e.score < 0.2)) {
    recs.push({
      action: 'hold',
      reason: 'Overall engagement is low this cycle; hold the next publish and re-cut the creative.',
      priority: 'low',
    });
  }

  if (recs.length === 0) {
    recs.push({
      action: 'hold',
      reason: 'No clear directional signal yet — continue the cadence and reassess next cycle.',
      priority: 'low',
    });
  }

  return recs;
}
