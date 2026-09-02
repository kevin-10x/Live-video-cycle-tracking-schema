import { YouTubeAdapter } from './youtube.js';
import { TikTokAdapter } from './tiktok.js';
import { InstagramAdapter } from './instagram.js';
import { XAdapter } from './x.js';
import { FacebookAdapter } from './facebook.js';

const registry = {
  youtube: new YouTubeAdapter(),
  tiktok: new TikTokAdapter(),
  instagram: new InstagramAdapter(),
  x: new XAdapter(),
  facebook: new FacebookAdapter(),
};

export function getAdapter(name) {
  return registry[name] || null;
}

export function registeredPlatforms() {
  return Object.keys(registry);
}

export function adapterConfigured(name) {
  const a = registry[name];
  return !!(a && a.isConfigured());
}
