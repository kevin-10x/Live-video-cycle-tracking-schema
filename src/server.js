import app from './app.js';
import { config } from './config/index.js';

app.listen(config.port, () => {
  console.log(`[video-pipeline] listening on http://localhost:${config.port}`);
});