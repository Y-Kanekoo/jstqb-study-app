import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const expoRequire = createRequire(require.resolve('expo/package.json'));
const wrapperRequire = createRequire(expoRequire.resolve('@expo/metro/package.json'));
const rnRequire = createRequire(require.resolve('react-native/package.json'));
const cliRequire = createRequire(rnRequire.resolve('@react-native/community-cli-plugin/package.json'));
const consumers = [wrapperRequire, cliRequire];

// This lockfile-level guard also catches a second, unreachable/stale resolution.
test('the complete lockfile excludes image-size and pre-fix Metro resolutions', async () => {
  const lock = await readFile(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8');
  assert.doesNotMatch(lock, /^\s+['"]?image-size(?:@|['"]?:)/mu);
  const versions = [...lock.matchAll(/^  metro@([^:(]+).*:$/gmu)].map((match) => match[1]);
  assert.ok(versions.length > 0);
  assert.deepEqual([...new Set(versions)], ['0.84.5']);
});

test('Expo and React Native CLI resolve the same patched Metro family', () => {
  assert.equal(wrapperRequire('./package.json').version, '56.0.2');
  assert.equal(consumers[0].resolve('metro/package.json'), consumers[1].resolve('metro/package.json'));
  const visited = new Set();
  function inspect(from, name) {
    const manifestPath = from.resolve(`${name}/package.json`);
    if (visited.has(manifestPath)) return;
    visited.add(manifestPath);
    const localRequire = createRequire(manifestPath);
    const manifest = localRequire(manifestPath);
    assert.equal(manifest.version, '0.84.5', name);
    assert.equal(manifest.dependencies?.['image-size'], undefined, name);
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      if (/^(?:metro(?:-|$)|ob1$)/u.test(dependency)) inspect(localRequire, dependency);
    }
  }
  for (const consumer of consumers) {
    for (const dependency of Object.keys(consumer('./package.json').dependencies)) {
      if (/^metro(?:-|$)/u.test(dependency)) inspect(consumer, dependency);
    }
  }
  assert.equal(visited.size, 15, '14 Metro packages and ob1 must be inspected');
});

test('both consumers parse real SVG assets and PNG bytes through Metro Assets', async () => {
  const svgPath = fileURLToPath(new URL('../public/app-icon.svg', import.meta.url));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/j8AAAAASUVORK5CYII=', 'base64');
  for (const consumer of consumers) {
    const assets = consumer('metro/private/Assets');
    assert.deepEqual(assets.getAssetSize('png', png, 'one.png'), { width: 1, height: 1 });
    // Preserve Metro's documented content fallback for a mismatched extension.
    assert.deepEqual(assets.getAssetSize('jpg', png, 'one.jpg'), { width: 1, height: 1 });
    const data = await assets.getAssetData(svgPath, 'app-icon.svg', [], 'web', '/assets');
    assert.equal(data.width, 512);
    assert.equal(data.height, 512);
    assert.equal(data.__packager_asset, true);
    assert.deepEqual(data.files, [svgPath]);
  }
});

test('malformed ICNS disguised as PNG is rejected without blocking the event loop', () => {
  for (const consumer of consumers) {
    // Isolate the synchronous parser: the vulnerable baseline loops forever.
    const script = `
      const assert = require('node:assert/strict');
      const { getAssetSize } = require(${JSON.stringify(consumer.resolve('metro/private/Assets'))});
      const icns = Buffer.alloc(16);
      icns.write('icns', 0); icns.writeUInt32BE(16, 4); icns.write('ic07', 8);
      assert.throws(() => getAssetSize('png', icns, 'malformed.png'));
      assert.throws(() => getAssetSize('png', Buffer.alloc(0), 'empty.png'));
    `;
    execFileSync(process.execPath, ['-e', script], { timeout: 3000, stdio: 'pipe' });
  }
});
