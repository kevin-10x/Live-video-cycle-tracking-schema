import { BasePlatformAdapter } from './base.js';

// X (Twitter) media upload adapter. Simulated by default; supply credentials to
// point at the media/upload + statuses/update endpoints.
export class XAdapter extends BasePlatformAdapter {
  constructor() {
    super('x');
  }

  isConfigured() {
    return !!(process.env.X_API_KEY && process.env.X_API_SECRET);
  }
}
