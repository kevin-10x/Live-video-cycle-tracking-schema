import { BasePlatformAdapter } from './base.js';

// Instagram Reels adapter. These adapters are real-skeleton: they follow the
// base contract and can be pointed at actual endpoints/credentials, but ship in
// simulated mode by default. Extend with your API credentials to make them live.
export class InstagramAdapter extends BasePlatformAdapter {
  constructor() {
    super('instagram');
  }

  isConfigured() {
    return !!process.env.INSTAGRAM_ACCESS_TOKEN;
  }
}
