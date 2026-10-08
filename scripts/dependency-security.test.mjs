import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
function consumer(...chain) {
  return chain.reduce((from, name) => createRequire(from.resolve(`${name}/package.json`)), require);
}
function dependencyManifest(from, name) {
  try { return from(`${name}/package.json`); } catch (error) {
    if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error;
  }
  let directory = dirname(from.resolve(name));
  while (directory !== dirname(directory)) {
    const file = join(directory, 'package.json');
    if (existsSync(file)) {
      const manifest = JSON.parse(readFileSync(file, 'utf8'));
      if (manifest.name === name) return manifest;
    }
    directory = dirname(directory);
  }
  throw new Error(`Package manifest not found: ${name}`);
}

const cli = consumer('expo', '@expo/cli');
const semver = cli('semver');
const expoPlist = consumer('expo', '@expo/config-plugins', '@expo/plist');
const xcodePlist = consumer('expo', '@expo/config-plugins', 'xcode', 'simple-plist', 'plist');
const eslintYaml = consumer('eslint', '@eslint/eslintrc');
const expoYaml = consumer('expo', '@expo/cli', '@expo/xcpretty');
const oldMinimatch = consumer('eslint', 'minimatch');
const newMinimatch = consumer('expo', '@expo/cli', 'glob', 'minimatch');

const expected = new Map([
  ['@xmldom/xmldom', ['0.8.15', '0.9.12']],
  ['js-yaml', ['4.3.2']],
  ['brace-expansion', ['1.1.21', '5.0.12']],
  ...['vitest', '@vitest/coverage-v8', '@vitest/expect', '@vitest/mocker', '@vitest/pretty-format',
    '@vitest/runner', '@vitest/snapshot', '@vitest/spy', '@vitest/utils'].map((name) => [name, ['4.1.11']]),
]);

test('all lockfile resolutions of remediated packages use the compatible fixed versions', async () => {
  const lock = await readFile(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8');
  const packages = lock.split('\npackages:\n')[1].split('\nsnapshots:\n')[0];
  const actual = new Map();
  for (const match of packages.matchAll(/^  '?(.+)@([^@:'()]+)'?:$/gmu)) {
    if (!expected.has(match[1])) continue;
    actual.set(match[1], [...(actual.get(match[1]) ?? []), match[2]]);
  }
  assert.deepEqual(actual, expected);
});

test('installed dependency edges satisfy every unchanged parent range', () => {
  for (const [parent, dependency, version] of [
    [expoPlist, '@xmldom/xmldom', '0.8.15'], [xcodePlist, '@xmldom/xmldom', '0.9.12'],
    [eslintYaml, 'js-yaml', '4.3.2'], [expoYaml, 'js-yaml', '4.3.2'],
    [oldMinimatch, 'brace-expansion', '1.1.21'], [newMinimatch, 'brace-expansion', '5.0.12'],
  ]) {
    assert.equal(parent(`${dependency}/package.json`).version, version);
    assert.ok(semver.satisfies(version, parent('./package.json').dependencies[dependency]), dependency);
  }
  const visited = new Set();
  function inspect(parent, name) {
    const local = consumerFrom(parent, name);
    const manifest = local('./package.json');
    if (visited.has(name)) return;
    visited.add(name);
    assert.equal(manifest.version, '4.1.11', name);
    // Also check all non-Vitest dependencies retained at their previous resolution.
    for (const [dependency, range] of Object.entries(manifest.dependencies ?? {})) {
      const resolved = dependencyManifest(local, dependency).version;
      assert.ok(semver.satisfies(resolved, range), `${name} -> ${dependency} ${range}: ${resolved}`);
      if (dependency.startsWith('@vitest/')) inspect(local, dependency);
    }
  }
  function consumerFrom(parent, name) { return createRequire(parent.resolve(`${name}/package.json`)); }
  inspect(require, 'vitest');
  inspect(require, '@vitest/coverage-v8');
  assert.equal(visited.size, 9);
  assert.equal(require('@vitest/coverage-v8/package.json').peerDependencies.vitest, '4.1.11');
});

test('both plist consumers preserve XML escaping, Unicode, arrays and scalar types', () => {
  const input = { title: '学習<&"', enabled: true, attempts: 3, ratio: 1.25, tags: ['一章', 'a&b'] };
  for (const plist of [expoPlist('./build/index.js').default, xcodePlist('./index.js')]) {
    const serialized = plist.build(input);
    assert.match(serialized, /&lt;&amp;/u);
    assert.deepEqual({ ...plist.parse(serialized) }, input);
  }
});

test('YAML consumers preserve valid merges and reject over-budget empty merge sources', () => {
  for (const parent of [eslintYaml, expoYaml]) {
    const yaml = parent('js-yaml');
    assert.deepEqual(yaml.load('base: &base {enabled: true}\napp: {<<: *base, count: 3}\n'), {
      base: { enabled: true }, app: { enabled: true, count: 3 },
    });
    const emptyMerge = 'arr: &arr [{}, {}, {}]\ntarget: {<<: *arr}\n';
    assert.throws(() => yaml.load(emptyMerge, { maxTotalMergeKeys: 2 }), /maxTotalMergeKeys/u);
    assert.deepEqual(yaml.load(emptyMerge, { maxTotalMergeKeys: 3 }).target, {});
  }
});

test('both minimatch consumers preserve brace expansion and negative matches', () => {
  for (const parent of [oldMinimatch, newMinimatch]) {
    const exported = parent(parent.resolve('./'));
    const match = typeof exported === 'function' ? exported : exported.minimatch;
    assert.equal(match('src/chapter-2.ts', 'src/chapter-{1..3}.{ts,tsx}'), true);
    assert.equal(match('src/chapter-4.ts', 'src/chapter-{1..3}.{ts,tsx}'), false);
    assert.equal(match('src/chapter-2.js', 'src/chapter-{1..3}.{ts,tsx}'), false);
  }
});
