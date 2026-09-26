import { config } from '../config/index.js';
import { BasePlatformAdapter, PublishError, buildUrl, externalId } from './base.js';

// YouTube Data API v3.
// - publish(): would call resumable upload -> videos.insert
// - fetchMetrics(): calls videos.list(part=snippet,statistics)
// Real uploads require OAuth2 (service account or user consent token) plus the
// youtube.upload scope. We implement the fetch (read-only, key-based) for real,
// and keep publish keyed off presence of an access token; absent credentials we
// run the deterministic simulated path.
export class YouTubeAdapter extends BasePlatformAdapter {
  constructor() {
    super('youtube');
    this.cfg = config.platforms.youtube;
  }

  isConfigured() {
    return !!(this.cfg.apiKey || this.cfg.channelId);
  }

  async publish({ video, variant }) {
    if (!this.isConfigured()) {
      // no credentials -> simulated
      this.simulated = true;
      const id = externalId(this.name);
      return { url: buildUrl(this.name, id), external_id: id, variant_id: variant.id };
    }

    // Real upload path. Requires an upload token; without one we surface a
    // retryable error so the orchestrator records it in cycle.errors.
    const uploadToken = process.env.YOUTUBE_UPLOAD_TOKEN;
    if (!uploadToken) {
      throw new PublishError('YouTube upload requires YOUTUBE_UPLOAD_TOKEN (OAuth2)', {
        code: 'YT_UPLOAD_TOKEN_MISSING',
        retryable: true,
        platform: this.name,
      });
    }
    this.simulated = false;

    const endpoint = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
    const initRes = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${uploadToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snippet: { title: video.title, description: video.description, tags: video.tags || [] },
        status: { privacyStatus: 'public' },
      }),
    });
    if (!initRes.ok) {
      throw new PublishError(`YouTube init failed: ${initRes.status}`, {
        code: 'YT_UPLOAD_INIT_FAILED',
        retryable: initRes.status >= 500,
        platform: this.name,
      });
    }
    const uploadUrl = initRes.headers.get('Location');

    const videoRes = await fetch(video.file_path, { method: 'GET' });
    if (!videoRes.ok) throw new PublishError('Could not read video file', { code: 'YT_FILE_READ', platform: this.name });
    const body = Buffer.from(await videoRes.arrayBuffer());

    const up = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body });
    if (!up.ok) {
      throw new PublishError(`YouTube upload failed: ${up.status}`, {
        code: 'YT_UPLOAD_FAILED',
        retryable: up.status >= 500,
        platform: this.name,
      });
    }
    const data = await up.json();
    const id = data && data.id ? data.id : externalId(this.name);
    return { url: buildUrl(this.name, id), external_id: id, variant_id: variant.id };
  }

  async fetchMetrics(externalIdArg) {
    // Real players have an external_id; we only get called with one when this
    // adapter published for real. Key-based read works without OAuth.
    if (this.isConfigured() && externalIdArg) {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(externalIdArg)}&key=${encodeURIComponent(this.cfg.apiKey)}`;
      try {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const item = data.items && data.items[0];
          if (item && item.statistics) {
            const s = item.statistics;
            this.simulated = false;
            return {
              views: parseInt(s.viewCount || '0', 10),
              likes: parseInt(s.likeCount || '0', 10),
              comments: parseInt(s.commentCount || '0', 10),
            };
          }
        }
        this.metricsError = `YouTube statistics unavailable (HTTP ${res.status})`;
      } catch (e) {
        this.metricsError = `YouTube statistics request failed: ${e.message}`;
      }
    }
    // The real call did not produce data. Returning sample numbers here would be
    // indistinguishable from a real low-performing video, so the orchestrator is
    // told via metricsError and the cycle records the failure.
    this.simulated = true;
    return this._simulateMetrics();
  }
}
