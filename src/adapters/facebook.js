import { BasePlatformAdapter } from './base.js';

// Facebook Video upload adapter (Graph API). Simulated by default.
export class FacebookAdapter extends BasePlatformAdapter {
  constructor() {
    super('facebook');
  }

  isConfigured() {
    return !!process.env.FACEBOOK_ACCESS_TOKEN;
  }
}
