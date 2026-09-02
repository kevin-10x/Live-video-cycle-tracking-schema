// Adapter contract: every platform implements publishMetrics() and fetchMetrics().
// Real adapters (youtube, tiktok) hit their public APIs when credentials are
// configured; otherwise they degrade to simulated mode so the whole pipeline is
// runnable without keys.

export class PublishError extends Error {
  constructor(message, { code, retryable = true, platform } = {}) {
    super(message);
    this.name = 'PublishError';
    this.code = code;
    this.retryable = retryable;
    this.platform = platform;
  }
}

export function buildUrl(platform, id) {
  switch (platform) {
    case 'youtube':
      return `https://www.youtube.com/watch?v=${id}`;
    case 'tiktok':
      return `https://www.tiktok.com/@channel/video/${id}`;
    case 'instagram':
      return `https://www.instagram.com/reel/${id}`;
    case 'x':
      return `https://x.com/channel/status/${id}`;
    case 'facebook':
      return `https://www.facebook.com/watch/?v=${id}`;
    default:
      return `https://example.com/${platform}/${id}`;
  }
}

export function externalId(platform) {
  return `${platform}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

// Base class provides the simulated path used when no real credentials exist.
// Subclasses override publish()/fetchMetrics() to call real APIs.
export class BasePlatformAdapter {
  constructor(name) {
    this.name = name;
    this.simulated = true;
  }

  isConfigured() {
    return false;
  }

  // Publishes a prepared variant and returns { url, external_id, variant_id }.
  async publish({ video, variant }) {
    await this._simulateLatency();
    const id = externalId(this.name);
    return {
      url: buildUrl(this.name, id),
      external_id: id,
      variant_id: variant.id,
    };
  }

  // Returns metrics_1h for a previously published item.
  async fetchMetrics() {
    await this._simulateLatency();
    return this._simulateMetrics();
  }

  _simulateMetrics() {
    return {
      views: randInt(500, 50000),
      likes: randInt(20, 4000),
      shares: randInt(0, 800),
      comments: randInt(0, 300),
      watchTime: randInt(200, 20000),
      avgViewDuration: rand(8, 45),
      retentionRate: rand(0.15, 0.9),
      ctr: rand(0.01, 0.2),
    };
  }

  _simulateLatency() {
    return new Promise((r) => setTimeout(r, randInt(5, 40)));
  }
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function rand(min, max) {
  return +(Math.random() * (max - min) + min).toFixed(4);
}
