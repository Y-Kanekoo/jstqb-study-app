import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const expo = createRequire(require.resolve('expo/package.json'));
const cli = createRequire(expo.resolve('@expo/cli/package.json'));
const semver = cli('semver');
const root = require('../package.json');

test('direct dependencies and installed versions remain inside Expo SDK 57 supported ranges', () => {
  assert.equal(expo('./package.json').version, '57.0.26');
  const supported = expo('./bundledNativeModules.json');
  let checked = 0;
  for (const [name, range] of Object.entries({ ...root.dependencies, ...root.devDependencies })) {
    if (!supported[name]) continue;
    const version = JSON.parse(readFileSync(new URL(`../node_modules/${name}/package.json`, import.meta.url), 'utf8')).version;
    assert.ok(semver.subset(range, supported[name]), `${name}: declared ${range}, SDK ${supported[name]}`);
    assert.ok(semver.satisfies(version, supported[name]), `${name}: installed ${version}, SDK ${supported[name]}`);
    checked += 1;
  }
  assert.ok(checked >= 19, 'must cover the SDK native modules and React/tooling peers');
  assert.equal(require('react').version, require('react-dom').version);
  assert.ok(semver.satisfies(require('react').version, require('react-native/package.json').peerDependencies.react));
});

test('Expo CLI resolves the supported RN polyfill API and actual polyfill files', () => {
  const rn = createRequire(cli.resolve('react-native/package.json'));
  assert.equal(rn('./package.json').version, require('react-native/package.json').version);
  const getPolyfills = cli('react-native/rn-get-polyfills');
  assert.equal(typeof getPolyfills, 'function');
  const files = getPolyfills();
  assert.ok(files.length >= 2);
  for (const file of files) {
    assert.equal(existsSync(file), true);
    assert.ok(readFileSync(file, 'utf8').length > 0);
  }
});
