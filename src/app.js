import express from 'express';
import cors from 'cors';
import './db/migrate.js';
import { config } from './config/index.js';
import { cyclesRouter, videosRouter } from './routes/cycles.js';
import { notFound, errorHandler } from './utils/http.js';
import { buildCorsOptions } from './utils/cors.js';

const app = express();

// Resolve the CORS allow-list. See utils/cors.js for why a bare "*" must not
// become the array ['*'].
app.use(cors(buildCorsOptions(config.corsOrigin)));
app.use(express.json());

app.get('/health', (req, res) => res.json({ success: true, status: 'ok' }));
app.get('/api/health', (req, res) => res.json({ success: true, status: 'ok' }));

app.use('/api/cycles', cyclesRouter);
app.use('/api/videos', videosRouter);

app.use(notFound);
app.use(errorHandler);

export default app;