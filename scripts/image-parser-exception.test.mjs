import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const expo = createRequire(require.resolve('expo/package.json'));
const wrapper = createRequire(expo.resolve('@expo/metro/package.json'));
const rn = createRequire(require.resolve('react-native/package.json'));
const cli = createRequire(rn.resolve('@react-native/community-cli-plugin/package.json'));

test('image-size is absent from the whole lockfile and installed reachable dependency graph', () => {
  const lock = readFileSync(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8');
  assert.doesNotMatch(lock, /^\s+['"]?image-size(?:@|['"]?:)/mu);
  const visited = new Set();
  function inspect(from, name, optional = false) {
    assert.notEqual(name, 'image-size');
    let entry;
    try { entry = from.resolve(`${name}/package.json`); } catch (error) {
      if (error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
        // pnpm list covers packages hiding their manifest behind exports.
        return;
      }
      if (optional && error.code === 'MODULE_NOT_FOUND') return;
      throw error;
    }
    if (visited.has(entry)) return;
    visited.add(entry);
    const local = createRequire(entry);
    const manifest = local(entry);
    for (const dependency of Object.keys(manifest.dependencies ?? {})) inspect(local, dependency);
    for (const dependency of Object.keys(manifest.optionalDependencies ?? {})) inspect(local, dependency, true);
  }
  const root = require('../package.json');
  for (const name of Object.keys({ ...root.dependencies, ...root.devDependencies })) inspect(require, name);
  assert.ok(visited.size > 100, 'must inspect the installed dependency tree');
  const graph = execFileSync('pnpm', ['list', '--depth', 'Infinity', '--json'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  assert.doesNotMatch(graph, /"image-size"/u);
});

test('both Metro consumers parse valid PNG and reject malformed ICNS within a process deadline', () => {
  for (const consumer of [wrapper, cli]) {
    const script = `
      const assert = require('node:assert/strict');
      const { getAssetSize } = require(${JSON.stringify(consumer.resolve('metro/private/Assets'))});
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/j8AAAAASUVORK5CYII=', 'base64');
      assert.deepEqual(getAssetSize('png', png, 'valid.png'), {width:1,height:1});
      const icns = Buffer.alloc(16);
      icns.write('icns'); icns.writeUInt32BE(16,4); icns.write('ic07',8);
      assert.throws(() => getAssetSize('png', icns, 'malformed.png'));
    `;
    execFileSync(process.execPath, ['-e', script], { timeout: 3000, stdio: 'pipe' });
  }
});
