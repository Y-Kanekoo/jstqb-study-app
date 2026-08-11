import { access, readFile } from 'node:fs/promises';

const baseUrl = (process.env.EXPO_PUBLIC_BASE_URL ?? '').trim().replace(/\/$/u, '');
if (!baseUrl.startsWith('/')) {
  console.error('EXPO_PUBLIC_BASE_URLは/から始まる必要があります。');
  process.exit(1);
}

const distUrl = new URL('../dist/', import.meta.url);
const index = await readFile(new URL('index.html', distUrl), 'utf8');
const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', distUrl), 'utf8'));
const referencedPaths = [...index.matchAll(/(?:src|href)="([^"#]+)"/gu)].map((match) => match[1]);
const violations = [];

for (const referencedPath of referencedPaths) {
  if (!referencedPath.startsWith(`${baseUrl}/`)) {
    violations.push(`ベースパス外の参照です: ${referencedPath}`);
    continue;
  }
  const artifactPath = referencedPath.slice(baseUrl.length + 1);
  try {
    await access(new URL(artifactPath, distUrl));
  } catch {
    violations.push(`参照先が成果物にありません: ${referencedPath}`);
  }
}

if (manifest.start_url !== `${baseUrl}/` || manifest.scope !== `${baseUrl}/`) {
  violations.push('manifestのstart_urlまたはscopeがPagesベースパスと一致しません');
}

for (const requiredFile of ['404.html', '.nojekyll', 'sw.js']) {
  try {
    await access(new URL(requiredFile, distUrl));
  } catch {
    violations.push(`Pages必須成果物がありません: ${requiredFile}`);
  }
}

if (violations.length > 0) {
  console.error(`Pages成果物検査に失敗しました:\n${violations.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`${baseUrl}/ 配下で公開するPages成果物を検証しました。`);
}
