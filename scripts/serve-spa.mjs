import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const port = Number.parseInt(process.env.PORT ?? '8081', 10);
const distDirectory = new URL('../dist/', import.meta.url).pathname;
const previewBaseUrl = (process.env.PREVIEW_BASE_URL ?? '').trim().replace(/\/$/u, '');
if (previewBaseUrl && (!previewBaseUrl.startsWith('/') || previewBaseUrl.includes('..'))) {
  throw new Error('PREVIEW_BASE_URLは/から始まる安全なパスである必要があります。');
}
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
  if (process.env.E2E_FIXTURES_ENABLED === 'true' && url.pathname === '/__e2e__/account/profile') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({
      authorization: request.headers.authorization ?? '認証なし',
      cookie: request.headers.cookie ?? 'Cookieなし',
      method: request.method ?? '不明',
    }));
    return;
  }
  if (previewBaseUrl && url.pathname !== previewBaseUrl && !url.pathname.startsWith(`${previewBaseUrl}/`)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end('プレビュー対象外のパスです。');
    return;
  }
  const scopedPath = previewBaseUrl ? url.pathname.slice(previewBaseUrl.length) || '/' : url.pathname;
  const safePath = normalize(decodeURIComponent(scopedPath)).replace(/^(\.\.(\/|\\|$))+/, '');
  const candidate = join(distDirectory, safePath);
  const filePath = existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(distDirectory, 'index.html');
  const contentType = contentTypes[extname(filePath)] ?? 'application/octet-stream';
  response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600' });
  createReadStream(filePath).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`プレビューを http://127.0.0.1:${port} で開始しました。`);
});
