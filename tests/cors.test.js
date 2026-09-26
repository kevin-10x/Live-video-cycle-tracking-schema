import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { buildCorsOptions } from '../src/utils/cors.js';

// Same regression guard as the school backend: splitting "*" into ["*"] made the
// cors package match no origin and emit no headers, which passes health checks
// but fails every browser request in a cross-origin deploy.

function startServer(options) {
  const app = express();
  app.use(cors(options));
  app.get('/probe', (req, res) => res.json({ ok: true }));
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => resolve(server));
  });
}

async function probe(server, origin) {
  const res = await fetch(`http://127.0.0.1:${server.address().port}/probe`, {
    headers: { Origin: origin },
  });
  return res.headers.get('access-control-allow-origin');
}

test('wildcard reflects origin', async () => {
  const s = await startServer(buildCorsOptions('*'));
  assert.equal(await probe(s, 'https://client.vercel.app'), 'https://client.vercel.app');
  s.close();
});

test('explicit list is honored and unknown origins blocked', async () => {
  const s = await startServer(buildCorsOptions('https://a.test'));
  assert.equal(await probe(s, 'https://a.test'), 'https://a.test');
  assert.equal(await probe(s, 'https://evil.test'), null);
  s.close();
});

test('regression: ["*"] form drops all headers (the original bug)', async () => {
  const s = await startServer({ origin: '*'.split(',') });
  assert.equal(await probe(s, 'https://client.vercel.app'), null);
  s.close();
});
