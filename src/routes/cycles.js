import { Router } from 'express';
import { ok, created, ApiError, asyncHandler } from '../utils/http.js';
import { runCycle, repostCycle, createCycleForVideo, registeredPlatforms } from '../engine/orchestrator.js';
import { listCycles, getCycle, getVideo, storeVideo, listVideos } from '../utils/store.js';
import { validateCycle } from '../schema/cycle.js';

export const cyclesRouter = Router();

cyclesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10) || 20));
    const { cycles, total, skipped } = await listCycles({ limit, offset: (page - 1) * limit });
    ok(res, cycles, { page, limit, total, ...(skipped.length ? { skipped } : {}) });
  })
);

// Provide a "library" endpoint for showing available platforms.
cyclesRouter.get(
  '/platforms',
  asyncHandler(async (req, res) => {
    ok(res, registeredPlatforms());
  })
);

cyclesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const cycle = await getCycle(req.params.id);
    if (!cycle) throw new ApiError(404, 'Cycle not found');
    ok(res, cycle);
  })
);

// Run a new publish cycle. Supply a video inline, or reference a stored video by id.
cyclesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { video, video_id, platforms } = req.body || {};

    if (!video_id && !video) throw new ApiError(400, 'Provide a video or video_id');
    if (platforms && !Array.isArray(platforms)) throw new ApiError(400, 'platforms must be an array');

    let cycle;
    if (video_id) {
      const row = await getVideo(video_id);
      if (!row) throw new ApiError(404, 'Video not found');
      cycle = await createCycleForVideo(row, { platforms });
    } else {
      if (!video.title) throw new ApiError(400, 'video.title is required');
      cycle = await runCycle(video, { platforms });
    }
    created(res, cycle);
  })
);

// Repost: schedule a new cycle for an existing video (fresh cycle_id, timestamp, metrics).
cyclesRouter.post(
  '/:id/repost',
  asyncHandler(async (req, res) => {
    const row = await getVideo(req.params.id);
    if (!row) throw new ApiError(404, 'Video not found');
    const { platforms } = req.body || {};
    const cycle = await repostCycle(row, { platforms, video_id: row.id });
    created(res, cycle);
  })
);

// Validate arbitrary cycle JSON against the contract (useful for ingest).
cyclesRouter.post(
  '/validate',
  asyncHandler(async (req, res) => {
    try {
      const parsed = validateCycle(req.body);
      ok(res, { valid: true, cycle: parsed });
    } catch (e) {
      throw new ApiError(400, 'Invalid cycle JSON', e.issues || e.message);
    }
  })
);

// Video library for the pipeline.
export const videosRouter = Router();

videosRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const videos = await listVideos();
    ok(res, videos);
  })
);

videosRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const v = req.body || {};
    if (!v.title) throw new ApiError(400, 'title is required');
    const result = await storeVideo(v);
    created(res, result);
  })
);