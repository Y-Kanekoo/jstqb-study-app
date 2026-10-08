import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const router = createRequire(require.resolve('expo-router/package.json'));
const queryPath = router.resolve('query-string');
const query = router('query-string');
const queryRequire = createRequire(queryPath);
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/uri-query-contract.json', import.meta.url), 'utf8'));
const coreParse = router('expo-router/build/react-navigation/core/getStateFromPath').getStateFromPath;
const coreStringify = router('expo-router/build/react-navigation/core/getPathFromState').getPathFromState;
const expoParse = router('expo-router/build/fork/getStateFromPath-forks').parseQueryParams;
// Node cannot load the RN UI barrel's Flow source. Resolve ONLY this barrel edge
// to its actual pure validator; query-string, all router functions and URL parsing stay real.
const helperUrl = pathToFileURL(router.resolve('expo-router/build/fork/getPathFromState-forks')).href;
const validatorUrl = pathToFileURL(router.resolve('expo-router/build/react-navigation/core/validatePathConfig')).href;
const hook = registerHooks({ resolve(specifier, context, next) {
  if (specifier === '../react-navigation/native' && context.parentURL === helperUrl) {
    return { url: validatorUrl, shortCircuit: true };
  }
  return next(specifier, context);
} });
let expoStringify;
let appendQueryAndHash;
try {
  expoStringify = router('expo-router/build/fork/getPathFromState').getPathFromState;
  appendQueryAndHash = router('expo-router/build/fork/getPathFromState-forks').appendQueryAndHash;
} finally { hook.deregister(); }
const screens = { screens: { practice: 'practice/:sessionId' } };

test('only the patched query-string consumer resolves the official fixed decoder', () => {
  const eslint = createRequire(require.resolve('eslint/package.json'));
  const eslintrc = createRequire(eslint.resolve('@eslint/eslintrc/package.json'));
  const lock = eslintrc('js-yaml').load(readFileSync(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(lock.packages).filter(k => k.startsWith('decode-uri-component@')), ['decode-uri-component@0.5.0']);
  assert.equal(lock.overrides['query-string@7.1.3>decode-uri-component'], '0.5.0');
  const patch = readFileSync(new URL('../patches/query-string@7.1.3.patch', import.meta.url), 'utf8');
  const hash = createHash('sha256').update(patch.replaceAll('\r\n', '\n')).digest('hex');
  assert.equal(lock.patchedDependencies['query-string@7.1.3'], hash);
  assert.equal(lock.snapshots[`query-string@7.1.3(patch_hash=${hash})`].dependencies['decode-uri-component'], '0.5.0');
  assert.equal(queryRequire('./package.json').version, '7.1.3');
  const decoderPath = queryRequire.resolve('decode-uri-component');
  assert.equal(JSON.parse(readFileSync(join(dirname(decoderPath), 'package.json'), 'utf8')).version, '0.5.0');
  assert.equal(typeof queryRequire('decode-uri-component').default, 'function');
});

test('query-string retains literal parse, array, empty, plus and fragment contracts', () => {
  for (const f of fixtures.parse) {
    const result = query.parse(f.input, f.options);
    assert.equal(Object.getPrototypeOf(result), null, f.name);
    assert.deepEqual({ ...result }, f.expected, f.name);
  }
  for (const f of fixtures.fragment) {
    assert.equal(query.parseUrl(f.input, { parseFragmentIdentifier: true }).fragmentIdentifier, f.expected);
  }
  assert.equal(query.stringify({ missing: undefined, present: '' }), 'present=');
  for (const f of fixtures.stringify) assert.equal(query.stringify(f.input, { sort: false }), f.expected, f.name);
});

test('bundled React Navigation parses actual query bytes with its distinct legacy contract', () => {
  for (const f of fixtures.parse.filter(f => !f.options)) {
    const state = coreParse(`/practice/synthetic?${f.input}`, screens);
    assert.equal(state.routes[0].name, 'practice');
    assert.deepEqual(state.routes[0].params, { sessionId: 'synthetic', ...f.expected }, f.name);
  }
  const state = { routes: [{ name: 'practice', params: { sessionId: 'synthetic', q: '日本 +', empty: '' } }] };
  const bytes = coreStringify(state, screens);
  assert.equal(bytes, '/practice/synthetic?q=%E6%97%A5%E6%9C%AC%20%2B&empty=');
  assert.deepEqual(coreParse(bytes, screens).routes[0].params, state.routes[0].params);
});

test('Expo parses its URLSearchParams contract and consumes real generated URL bytes', () => {
  for (const f of fixtures.parse.filter(f => !f.options)) {
    const result = expoParse(`/practice/synthetic?${f.input}`, { name: 'practice', params: { sessionId: 'synthetic' } });
    assert.deepEqual({ ...result }, f.expoExpected ?? f.expected, f.name);
  }
  const params = { sessionId: 'synthetic', tag: ['a', 'b'], q: '日本 +', empty: '' };
  const bytes = expoStringify({ routes: [{ name: 'practice', params }] }, screens);
  assert.equal(bytes, '/practice/synthetic?tag=a&tag=b&q=%E6%97%A5%E6%9C%AC%20%2B&empty=');
  assert.deepEqual({ ...expoParse(bytes, { name: 'practice', params: { sessionId: 'synthetic' } }) }, { tag: ['a', 'b'], q: '日本 +', empty: '' });
  assert.equal(appendQueryAndHash('/practice/synthetic', { q: 'a+b', '#': 'section' }), '/practice/synthetic?q=a%2Bb#section');
});

test('malformed UTF-8 run finishes through the real query parser without recursive exhaustion', () => {
  const result = spawnSync(process.execPath, ['--input-type=commonjs', '-e',
    'const q=require(process.argv[1]);const input="%FE".repeat(20000);if(q.parse("q="+input).q!==input)process.exit(2);', queryPath],
  { timeout: 5000, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
});
