import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED = /^\/(index\.html|src\/[\w.-]+\.js)$/;      // nothing else is ever served (.env, server/, ...)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

export function createBridge({ port, host = '127.0.0.1' }) {
  const server = http.createServer((req, res) => {
    let p = new URL(req.url, 'http://x').pathname;
    if (p === '/') p = '/index.html';
    if (!ALLOWED.test(p)) { res.writeHead(404).end('not found'); return; }
    fs.readFile(path.join(ROOT, p), (err, buf) => {
      if (err) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(buf);
    });
  });

  // Only pages served by this very server may connect (blocks other websites from reaching localhost).
  const okOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  const wss = new WebSocketServer({
    server, path: '/ws', maxPayload: 1024,
    verifyClient: ({ origin }) => !origin || okOrigins.has(origin),
  });

  return {
    listen: () => new Promise((resolve) => server.listen(port, host, resolve)),
    close: () => new Promise((resolve) => { wss.clients.forEach((c) => c.terminate()); server.close(resolve); }),
    get clientCount() { return wss.clients.size; },
    broadcast(obj) {
      const msg = JSON.stringify(obj);
      for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
    },
  };
}
