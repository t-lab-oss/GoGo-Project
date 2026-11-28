// Chạy bản build (có service worker) để thử PWA và offline. API phải đang chạy (npm run dev:server).
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve('dist/web/browser');
const PORT = Number(process.env.PREVIEW_PORT ?? 4300);
const API_PORT = Number(process.env.PORT ?? 3001);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname.startsWith('/api')) {
    const upstream = request(
      { host: 'localhost', port: API_PORT, path: req.url, method: req.method, headers: req.headers },
      (reply) => {
        res.writeHead(reply.statusCode ?? 502, reply.headers);
        reply.pipe(res);
      },
    );
    upstream.on('error', () => res.writeHead(504).end());
    req.pipe(upstream);
    return;
  }
  let file = join(ROOT, normalize(pathname));
  // Đường dẫn của app (không phải file) trả index.html.
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) file = join(ROOT, 'index.html');
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Bản build: http://localhost:${PORT}`));
