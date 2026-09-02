import express from 'express';
import cors from 'cors';
import './db/migrate.js';
import { config } from './config/index.js';
import { cyclesRouter, videosRouter } from './routes/cycles.js';
import { notFound, errorHandler } from './utils/http.js';

const app = express();

app.use(cors({ origin: config.corsOrigin.split(',') }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ success: true, status: 'ok' }));
app.get('/api/health', (req, res) => res.json({ success: true, status: 'ok' }));

app.use('/api/cycles', cyclesRouter);
app.use('/api/videos', videosRouter);

app.use(notFound);
app.use(errorHandler);

export default app;