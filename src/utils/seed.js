import { storeVideo } from '../utils/store.js';
import { fingerprintVideo } from '../utils/video.js';

// Seed a few demo videos so the pipeline has material to publish.
export async function seedVideos() {
  const samples = [
    {
      title: 'Hauzral launch teaser',
      description: 'First 30-second cinematic reveal for the platform.',
      tags: ['teaser', 'launch'],
      file_path: 'https://cdn.example.com/assets/launch-teaser.mp4',
      duration: 30,
      width: 1080,
      height: 1920,
      fps: 30,
      audio_spec: 'aac 48k',
    },
    {
      title: 'Product walkthrough Part 1',
      description: 'Deep-dive screen recording with captions.',
      tags: ['walkthrough', 'product'],
      file_path: 'https://cdn.example.com/assets/walkthrough-1.mp4',
      duration: 180,
      width: 1920,
      height: 1080,
      fps: 30,
      audio_spec: 'aac 44k',
    },
  ];
  const created = [];
  for (const s of samples) {
    s.video_fingerprint = fingerprintVideo(s);
    const { id } = await storeVideo(s);
    created.push(id);
  }
  return created;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  import('../db/migrate.js').then(async (m) => {
    await m.migrationReady;
    const ids = await seedVideos();
    console.log(`Seeded ${ids.length} videos: ${ids.join(', ')}`);
  });
}