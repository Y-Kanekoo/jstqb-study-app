import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const expo = createRequire(require.resolve('expo/package.json'));
const plugins = createRequire(expo.resolve('@expo/config-plugins/package.json'));
const fromXcode = createRequire(plugins.resolve('xcode/package.json'));
const xcode = plugins('xcode');
const uuid = fromXcode('uuid');
const fixture = new URL('./fixtures/xcode-uuid/project.pbxproj', import.meta.url);
const fixturePath = fileURLToPath(fixture);
const idPattern = /^[0-9A-F]{24}$/u;

test('only the xcode 3.0.1 edge selects the fixed CommonJS uuid 11.1.1', () => {
  const yaml = createRequire(require.resolve('eslint/package.json'));
  const fromEslintrc = createRequire(yaml.resolve('@eslint/eslintrc/package.json'));
  const parse = fromEslintrc('js-yaml').load;
  const settings = parse(readFileSync(new URL('../pnpm-workspace.yaml', import.meta.url), 'utf8'));
  const lock = parse(readFileSync(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8'));
  assert.deepEqual(settings.overrides, { 'xcode@3.0.1>uuid': '11.1.1' });
  assert.deepEqual(lock.overrides, settings.overrides);
  assert.equal(lock.snapshots['xcode@3.0.1'].dependencies.uuid, '11.1.1');
  assert.deepEqual(Object.keys(lock.packages).filter((key) => key.startsWith('uuid@')), ['uuid@11.1.1']);
  assert.equal(fromXcode('./package.json').dependencies.uuid, '^7.0.3');
  assert.equal(fromXcode('uuid/package.json').version, '11.1.1');
  assert.match(fromXcode.resolve('uuid'), /[/\\]dist[/\\]cjs[/\\]index\.js$/u);
  assert.equal(typeof uuid.v4, 'function');
  const value = uuid.v4();
  assert.equal(uuid.validate(value), true);
  assert.equal(uuid.version(value), 4);
});

test('real xcode v4 calls generate unique 24-character uppercase object IDs', () => {
  const project = xcode.project(fixturePath).parseSync();
  const seen = new Set(project.allUuids());
  assert.equal(seen.size, 6);
  for (let index = 0; index < 256; index += 1) {
    const id = project.generateUuid();
    assert.match(id, idPattern);
    assert.equal(seen.has(id), false);
    seen.add(id);
    project.hash.project.objects.PBXGroup[id] = { isa: 'PBXGroup', children: [], sourceTree: '"<group>"' };
  }
  assert.equal(project.allUuids().length, 262);
});

test('real uuid v4 and xcode retry collisions against objects in different sections', (t) => {
  const project = xcode.project(fixturePath).parseSync();
  const before = xcode.project(fixturePath).parseSync().hash;
  // Control only v4's native entropy boundary; neither v4 nor generateUuid is replaced.
  const native = createRequire(fromXcode.resolve('uuid'))('./native.js').default;
  const values = [
    '11111111-1111-4111-8111-111100000000', // existing PBXProject after truncation
    '11111111-1111-4111-8111-1111ffffffff', // different UUID, same truncated ID
    '22222222-2222-4222-8222-2222ffffffff', // existing PBXGroup after truncation
    'abcdefab-cdef-4abc-8def-abcdef123456',
  ];
  const random = t.mock.method(native, 'randomUUID', () => {
    assert.ok(values.length > 0, 'collision retry must terminate');
    return values.shift();
  });
  assert.equal(project.generateUuid(), 'ABCDEFABCDEF4ABC8DEFABCD');
  assert.equal(random.mock.callCount(), 4);
  assert.deepEqual(project.hash, before, 'retry must preserve existing objects');
});

test('xcode-generated target, configurations, group and source references survive pbxproj round trips', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'xcode-uuid-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const project = xcode.project(fixturePath).parseSync();
  const originalIds = project.allUuids();
  const originalConfigurations = xcode.project(fixturePath).parseSync().hash.project.objects.XCBuildConfiguration;
  const target = project.addTarget('SyntheticApp', 'application', 'SyntheticApp', 'invalid.example.synthetic');
  const phase = project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target.uuid);
  const group = project.addPbxGroup([], 'SyntheticSources', 'SyntheticSources');
  project.addToPbxGroup(group.uuid, '222222222222422282222222');
  const source = project.addSourceFile('SyntheticSources/Example.swift', { target: target.uuid }, group.uuid);
  assert.ok(source);
  const generatedIds = project.allUuids().filter((id) => !originalIds.includes(id));
  assert.ok(generatedIds.length >= 10, 'target/configuration/product/phase/group/source objects must exist');
  assert.equal(new Set(project.allUuids()).size, project.allUuids().length);
  for (const id of generatedIds) assert.match(id, idPattern);

  function verify(parsed) {
    const objects = parsed.hash.project.objects;
    const nativeTarget = objects.PBXNativeTarget[target.uuid];
    assert.equal(nativeTarget.name, '"SyntheticApp"');
    assert.equal(objects.PBXProject['111111111111411181111111'].targets[0].value, target.uuid);
    assert.equal(nativeTarget.buildPhases[0].value, phase.uuid);
    assert.equal(objects.PBXSourcesBuildPhase[phase.uuid].files[0].value, source.uuid);
    assert.equal(objects.PBXBuildFile[source.uuid].fileRef, source.fileRef);
    assert.equal(objects.PBXFileReference[source.fileRef].path, '"SyntheticSources/Example.swift"');
    assert.equal(objects.PBXGroup[group.uuid].children[0].value, source.fileRef);
    assert.ok(objects.PBXGroup['222222222222422282222222'].children.some((child) => child.value === group.uuid));
    assert.ok(objects.PBXFileReference[nativeTarget.productReference]);
    const configurations = objects.XCConfigurationList[nativeTarget.buildConfigurationList].buildConfigurations;
    assert.deepEqual(configurations.map(({ value }) => objects.XCBuildConfiguration[value].name), ['Debug', 'Release']);
    for (const { value } of configurations) {
      assert.equal(objects.XCBuildConfiguration[value].buildSettings.PRODUCT_BUNDLE_IDENTIFIER, '"invalid.example.synthetic"');
    }
    for (const [key, value] of Object.entries(originalConfigurations)) {
      assert.equal(JSON.stringify(objects.XCBuildConfiguration[key]), JSON.stringify(value));
    }
    assert.deepEqual(new Set(parsed.allUuids()), new Set([...originalIds, ...generatedIds]));
  }

  verify(project);
  const first = join(directory, 'first.pbxproj');
  writeFileSync(first, project.writeSync());
  const parsed = xcode.project(first).parseSync();
  verify(parsed);
  const asynchronous = xcode.project(first);
  await new Promise((resolve, reject) => asynchronous.parse((error) => error ? reject(error) : resolve()));
  verify(asynchronous);
  assert.equal(JSON.stringify(asynchronous.hash), JSON.stringify(parsed.hash));
  const second = join(directory, 'second.pbxproj');
  writeFileSync(second, parsed.writeSync());
  const reparsed = xcode.project(second).parseSync();
  verify(reparsed);
  assert.deepEqual(reparsed.hash, parsed.hash);
  assert.equal(readFileSync(second, 'utf8'), readFileSync(first, 'utf8'));
});
