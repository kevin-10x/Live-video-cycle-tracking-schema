import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDb = path.resolve(__dirname, '..', '..', 'data', 'video-pipeline.db');

export const config = {
  port: parseInt(process.env.PORT || '4100', 10),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  dbPath: process.env.DB_PATH || defaultDb,

  // Platform credentials (mapped from env into adapters)
  platforms: {
    youtube: {
      apiKey: process.env.YOUTUBE_API_KEY || '',
      channelId: process.env.YOUTUBE_CHANNEL_ID || '',
    },
    tiktok: {
      accessToken: process.env.TIKTOK_ACCESS_TOKEN || '',
      openId: process.env.TIKTOK_OPEN_ID || '',
    },
  },
};

// SQLite will not create missing parent directories, and `data/` is gitignored
// so it is absent in a fresh clone and in some container/volume setups. Without
// this the first connection fails with SQLITE_CANTOPEN.
try {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
} catch (e) {
  console.error(`[config] Could not create database directory for ${config.dbPath}: ${e.message}`);
}

export function platformConfigured(name) {
  const p = (config.platforms && config.platforms[name]) || {};
  return Object.values(p).some((v) => typeof v === 'string' && v.length > 0);
}
