import { readFile, writeFile } from 'node:fs/promises';

const indexUrl = new URL('../dist/index.html', import.meta.url);
const generated = await readFile(indexUrl, 'utf8');
const metadata = `
    <meta name="theme-color" content="#F6F8FB" />
    <meta name="description" content="JSTQB Foundation Levelを1問ずつ学び、Webとスマホで続きを同期できる個人学習アプリ" />
    <link rel="icon" href="/app-icon.svg" type="image/svg+xml" />
    <link rel="manifest" href="/manifest.webmanifest" />`;

const localized = generated
  .replace('<html lang="en">', '<html lang="ja">')
  .replace('</title>', `</title>${metadata}`)
  .replace('You need to enable JavaScript to run this app.', 'このアプリを利用するにはJavaScriptを有効にしてください。');

await writeFile(indexUrl, localized, 'utf8');
