import crypto from 'node:crypto';

// Generate a stable sha256 fingerprint for a video asset. In a real pipeline
// this would hash the file bytes; we also fold in encoding metadata so that
// re-encodes of the same source produce distinct, auditable fingerprints.
export function fingerprintVideo(video) {
  const payload = JSON.stringify({
    file_path: video.file_path,
    title: video.title,
    duration: video.duration,
    width: video.width,
    height: video.height,
    fps: video.fps,
    audio: video.audio_spec,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

// Every platform prefers a slightly different aspect ratio / length. We derive
// a per-platform "variant" of the source video so optimizations are auditable.
const VARIANT_PROFILES = {
  youtube: { aspect: '16:9', maxDuration: 3600, label: 'standard' },
  tiktok: { aspect: '9:16', maxDuration: 60, label: 'vertical-short' },
  instagram: { aspect: '4:5', maxDuration: 90, label: 'portrait' },
  x: { aspect: '16:9', maxDuration: 140, label: 'landscape-short' },
  facebook: { aspect: '1:1', maxDuration: 240, label: 'square' },
};

export const PLATFORM_VARIANTS = Object.keys(VARIANT_PROFILES);

export function variantFor(platform, platformIndex) {
  const p = VARIANT_PROFILES[platform];
  if (!p) return null;
  return {
    id: `${platform}-v${platformIndex + 1}-${p.label.split('-')[0]}`,
    platform,
    aspect: p.aspect,
    maxDuration: p.maxDuration,
    label: p.label,
    thumbnail: `${platform}-thumb-${platformIndex + 1}.jpg`,
  };
}

export function durationFits(video, variant) {
  return video.duration <= variant.maxDuration;
}
