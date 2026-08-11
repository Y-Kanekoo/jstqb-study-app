import { copyFile, writeFile } from 'node:fs/promises';

const indexUrl = new URL('../dist/index.html', import.meta.url);
const fallbackUrl = new URL('../dist/404.html', import.meta.url);
const noJekyllUrl = new URL('../dist/.nojekyll', import.meta.url);

await copyFile(indexUrl, fallbackUrl);
await writeFile(noJekyllUrl, '', 'utf8');
