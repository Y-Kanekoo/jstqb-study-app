import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const port = Number.parseInt(process.env.PORT ?? '8081', 10);
const distDirectory = new URL('../dist/', import.meta.url).pathname;
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
};

createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const safePath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.(\/|\\|$))+/, '');
  const candidate = join(distDirectory, safePath);
  const filePath = existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(distDirectory, 'index.html');
  const contentType = contentTypes[extname(filePath)] ?? 'application/octet-stream';
  response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600' });
  createReadStream(filePath).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`プレビューを http://127.0.0.1:${port} で開始しました。`);
});
