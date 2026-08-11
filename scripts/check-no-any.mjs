import { readdir, readFile } from 'node:fs/promises';
import { extname, relative } from 'node:path';

const projectRoot = new URL('..', import.meta.url);
const ignoredDirectories = new Set([
  '.expo',
  '.git',
  'coverage',
  'dist',
  'node_modules',
]);
const targetExtensions = new Set(['.ts', '.tsx']);
const violations = [];

async function walk(directoryUrl) {
  const entries = await readdir(directoryUrl, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }

    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directoryUrl);
    if (entry.isDirectory()) {
      await walk(entryUrl);
      continue;
    }

    if (!targetExtensions.has(extname(entry.name))) {
      continue;
    }

    const source = await readFile(entryUrl, 'utf8');
    const lines = source.split('\n');
    for (const [index, line] of lines.entries()) {
      if (/\bany\b/u.test(line)) {
        violations.push(`${relative(projectRoot.pathname, entryUrl.pathname)}:${index + 1}`);
      }
    }
  }
}

await walk(projectRoot);

if (violations.length > 0) {
  console.error(`禁止されているanyを検出しました:\n${violations.join('\n')}`);
  process.exitCode = 1;
}
