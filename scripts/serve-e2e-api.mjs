import { createServer } from 'node:http';

const port = Number.parseInt(process.env.E2E_API_PORT ?? '4174', 10);

createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  response.setHeader('Cache-Control', 'no-store');

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.url?.startsWith('/account/profile') && request.method === 'GET') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ owner: request.headers.authorization ?? '認証なし' }));
    return;
  }

  response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ message: 'E2E APIに該当する経路がありません。' }));
}).listen(port, '127.0.0.1', () => {
  console.log(`E2E APIを http://127.0.0.1:${port} で開始しました。`);
});
