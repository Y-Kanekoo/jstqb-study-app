import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const indexUrl = new URL('../dist/index.html', import.meta.url);
const manifestUrl = new URL('../dist/manifest.webmanifest', import.meta.url);
const serviceWorkerUrl = new URL('../dist/sw.js', import.meta.url);
const distUrl = new URL('../dist/', import.meta.url);
const baseUrl = (process.env.EXPO_PUBLIC_BASE_URL ?? '').trim().replace(/\/$/u, '');
const generated = await readFile(indexUrl, 'utf8');
const metadata = `
    <meta name="theme-color" content="#F6F8FB" />
    <meta name="description" content="JSTQB Foundation Levelを1問ずつ学び、Webとスマホで続きを同期できる個人学習アプリ" />
    <link rel="icon" href="${baseUrl}/app-icon.svg" type="image/svg+xml" />
    <link rel="manifest" href="${baseUrl}/manifest.webmanifest" />`;

const localized = generated
  .replace('<html lang="en">', '<html lang="ja">')
  .replace('</title>', `</title>${metadata}`)
  .replace('You need to enable JavaScript to run this app.', 'このアプリを利用するにはJavaScriptを有効にしてください。');

await writeFile(indexUrl, localized, 'utf8');

const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
manifest.start_url = `${baseUrl}/`;
manifest.scope = `${baseUrl}/`;
manifest.icons = manifest.icons.map((icon) => ({ ...icon, src: `${baseUrl}/app-icon.svg` }));
await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const cacheableExtensions = new Set(['.css', '.html', '.ico', '.jpeg', '.jpg', '.js', '.json', '.png', '.svg', '.ttf', '.webmanifest', '.woff', '.woff2']);
const distDirectory = fileURLToPath(distUrl);
const files = await readdir(distUrl, { recursive: true, withFileTypes: true });
const cacheableFiles = files
  .filter((entry) => entry.isFile())
  .map((entry) => relative(distDirectory, `${entry.parentPath}${sep}${entry.name}`).split(sep).join('/'))
  .filter((path) => path !== 'index.html' && path !== 'sw.js' && cacheableExtensions.has(extname(path).toLowerCase()))
  .sort();
const appShell = [`${baseUrl}/`, ...cacheableFiles.map((path) => `${baseUrl}/${path}`)];
const cacheHash = createHash('sha256');
for (const path of cacheableFiles) {
  cacheHash.update(path);
  cacheHash.update(await readFile(new URL(path, distUrl)));
}
cacheHash.update(localized);

const serviceWorker = (await readFile(serviceWorkerUrl, 'utf8'))
  .replace(
    "const cacheName = 'jstqb-study-shell-development';",
    `const cacheName = 'jstqb-study-shell-${cacheHash.digest('hex').slice(0, 16)}';`,
  )
  .replace(
    "const appShell = [`${scopePath}/`, `${scopePath}/manifest.webmanifest`, `${scopePath}/app-icon.svg`];",
    `const appShell = ${JSON.stringify(appShell)};`,
  );
await writeFile(serviceWorkerUrl, serviceWorker, 'utf8');
