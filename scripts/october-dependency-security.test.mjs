import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer, get } from 'node:http';
import { once } from 'node:events';
import zlib from 'node:zlib';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
function consumer(...chain) {
  return chain.reduce((from, name) => createRequire(from.resolve(`${name}/package.json`)), require);
}
const cli = consumer('expo', '@expo/cli');
const devtools = consumer('react-native', 'react-devtools-core');
const postcss = consumer('vitest', 'vite', 'postcss');
const magicast = consumer('@vitest/coverage-v8', 'magicast');

test('all remediated lock resolutions and installed consumers use range-compatible official fixes', () => {
  const parse = consumer('eslint', '@eslint/eslintrc')('js-yaml').load;
  const lock = parse(readFileSync(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8'));
  const expected = { compression: '1.8.2', 'source-map-js': '1.2.2', 'shell-quote': '1.11.0' };
  const semver = cli('semver');
  for (const [name, version] of Object.entries(expected)) {
    assert.deepEqual(Object.keys(lock.packages).filter((key) => key.startsWith(`${name}@`)), [`${name}@${version}`]);
  }
  for (const [from, name] of [[cli, 'compression'], [devtools, 'shell-quote'], [postcss, 'source-map-js'], [magicast, 'source-map-js']]) {
    const version = from(`${name}/package.json`).version;
    assert.equal(version, expected[name]);
    assert.ok(semver.satisfies(version, from('./package.json').dependencies[name]));
  }
});

test('devtools shell quoting preserves ordinary arguments and rejects line terminators after comments', () => {
  const shell = devtools('shell-quote');
  const values = ['editor', 'file with space.js', '日本語', '', '$literal', 'a"b', "a'b"];
  assert.deepEqual(shell.parse(shell.quote(values)), values);
  for (const newline of ['\n', '\r', '\u2028', '\u2029']) {
    assert.throws(() => shell.quote([{ comment: 'synthetic' }, `safe${newline}inert-token`]), TypeError);
  }
  assert.equal(shell.quote([{ comment: 'synthetic' }, 'inert-token']), '#synthetic inert-token');
});

test('both source-map consumers preserve mappings and reject unsafe indexed section offsets', () => {
  for (const from of [postcss, magicast]) {
    const { SourceMapGenerator, SourceMapConsumer } = from('source-map-js');
    const generator = new SourceMapGenerator({ file: 'generated.js' });
    generator.addMapping({ generated: { line: 1, column: 0 }, original: { line: 2, column: 3 }, source: 'synthetic.ts', name: 'sample' });
    generator.setSourceContent('synthetic.ts', '\n   sample();');
    const bytes = generator.toString();
    const parsed = new SourceMapConsumer(bytes);
    assert.deepEqual(parsed.originalPositionFor({ line: 1, column: 0 }), { source: 'synthetic.ts', line: 2, column: 3, name: 'sample' });
    assert.equal(parsed.sourceContentFor('synthetic.ts'), '\n   sample();');
    const index = (offset) => ({ version: 3, sections: [{ offset, map: JSON.parse(bytes) }] });
    const indexed = new SourceMapConsumer(index({ line: 2, column: 1 }));
    assert.equal(indexed.originalPositionFor({ line: 3, column: 2 }).line, 2);
    for (const offset of [{ line: Infinity, column: 0 }, { line: -1, column: 0 }, { line: 0.5, column: 0 }, { line: 0, column: Infinity }, { line: 1000000000, column: 0 }]) {
      assert.throws(() => new SourceMapConsumer(index(offset)), /Section offset/u);
    }
  }
});

test('Expo compression sends valid gzip and releases its actual stream on premature client close', { timeout: 10000 }, async (t) => {
  const compression = cli('compression');
  const descriptor = Object.getOwnPropertyDescriptor(zlib, 'createGzip');
  const streams = [];
  t.after(() => { for (const stream of streams) stream.destroy(); });
  Object.defineProperty(zlib, 'createGzip', { ...descriptor, value: (...args) => {
    const stream = descriptor.value(...args);
    streams.push(stream);
    return stream;
  } });
  t.after(() => Object.defineProperty(zlib, 'createGzip', descriptor));
  const body = 'synthetic compression payload '.repeat(256);
  const middleware = compression({ threshold: 0 });
  const server = createServer((req, res) => middleware(req, res, () => {
    res.setHeader('Content-Type', 'text/plain');
    if (req.url === '/complete') res.end(body);
    else { res.write(body); res.flush(); }
  }));
  t.after(() => { server.closeAllConnections(); server.close(); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const complete = await new Promise((resolve, reject) => {
    get({ host: '127.0.0.1', port, path: '/complete', headers: { 'Accept-Encoding': 'gzip' } }, (res) => {
      assert.equal(res.headers['content-encoding'], 'gzip');
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
  assert.equal(zlib.gunzipSync(complete).toString(), body);
  await new Promise((resolve, reject) => {
    get({ host: '127.0.0.1', port, path: '/abort', headers: { 'Accept-Encoding': 'gzip' } }, (res) => {
      res.once('data', () => {
        const stream = streams.at(-1);
        assert.equal(stream.destroyed, false);
        stream.once('close', resolve);
        res.destroy();
      });
    }).on('error', reject);
  });
  assert.equal(streams.length, 2);
  assert.equal(streams[1].destroyed, true);
});
