import { config } from '../config/index.js';
import { BasePlatformAdapter, PublishError, buildUrl, externalId } from './base.js';

// TikTok Content Posting API.
// The official flow is a two-step "video_init" then "video_data" upload using
// the access_token + open_id (creator info). We implement the real HTTP calls
// when credentials are present, otherwise the simulated path.
export class TikTokAdapter extends BasePlatformAdapter {
  constructor() {
    super('tiktok');
    this.cfg = config.platforms.tiktok;
  }

  isConfigured() {
    return !!(this.cfg.accessToken && this.cfg.openId);
  }

  async publish({ video, variant }) {
    if (!this.isConfigured()) {
      this.simulated = true;
      const id = externalId(this.name);
      return { url: buildUrl(this.name, id), external_id: id, variant_id: variant.id };
    }

    const base = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
    const initRes = await fetch(base, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.cfg.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: video.title,
          description: video.description,
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: 0,
          chunk_size: 0,
          total_chunk_count: 1,
        },
      }),
    });
    if (!initRes.ok) {
      throw new PublishError(`TikTok init failed: ${initRes.status}`, {
        code: 'TT_UPLOAD_INIT_FAILED',
        retryable: initRes.status >= 500,
        platform: this.name,
      });
    }
    const init = await initRes.json();
    const data = init && init.data;
    if (!data || !data.publish_id) {
      throw new PublishError('TikTok init returned no publish_id', {
        code: 'TT_INIT_NO_ID',
        retryable: true,
        platform: this.name,
      });
    }

    await this._uploadChunks(data.upload_url, data.video);
    this.simulated = false;
    const id = data.publish_id;

    // Real URL derivation requires the video id; use publish_id placeholder URL.
    await this._simulateLatency();
    return { url: buildUrl(this.name, id), external_id: id, variant_id: variant.id };
  }

  async _uploadChunks(uploadUrl, videoSdk) {
    if (!uploadUrl) return;
    // chunked upload via videoSdk.upload_url endpoints; simplified single chunk.
    const videoRes = await fetch(uploadUrl, { method: 'GET' });
    if (!videoRes.ok) throw new PublishError('Could not read video file', { code: 'TT_FILE_READ', platform: this.name });
    const body = Buffer.from(await videoRes.arrayBuffer());
    const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body });
    if (!res.ok) {
      throw new PublishError(`TikTok upload failed: ${res.status}`, {
        code: 'TT_UPLOAD_FAILED',
        retryable: res.status >= 500,
        platform: this.name,
      });
    }
    if (videoSdk && Array.isArray(videoSdk.upload_url)) {
      // confirm each part for the POST_PUBLISH flow
      for (const partUrl of videoSdk.upload_url) {
        const c = await fetch(partUrl, { method: 'POST', headers: { Authorization: `Bearer ${this.cfg.accessToken}` } });
        if (!c.ok) throw new PublishError('TikTok part confirm failed', { code: 'TT_CONFIRM_FAILED', platform: this.name });
      }
    }
  }

  async fetchMetrics(externalIdArg) {
    if (this.isConfigured() && externalIdArg) {
      const url = 'https://open.tiktokapis.com/v2/video/query/?fields=view_count,like_count,share_count,comment_count';
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.cfg.accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ filters: { video_ids: [externalIdArg] } }),
        });
        if (res.ok) {
          const data = await res.json();
          const item = data && data.data && data.data.videos && data.data.videos[0];
          if (item) {
            this.simulated = false;
            return {
              views: item.view_count || 0,
              likes: item.like_count || 0,
              shares: item.share_count || 0,
              comments: item.comment_count || 0,
            };
          }
          this.metricsError = 'TikTok video query returned no data';
        } else {
          this.metricsError = `TikTok video query unavailable (HTTP ${res.status})`;
        }
      } catch (e) {
        this.metricsError = `TikTok video query failed: ${e.message}`;
      }
    }
    // The real call produced nothing; do not pass placeholders off as results.
    this.simulated = true;
    return this._simulateMetrics();
  }
}
