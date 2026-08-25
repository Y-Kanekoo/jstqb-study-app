import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  createDocsContractReport,
  extractTypeScriptFences,
  runDocsContractCheck,
} from './check-doc-ts-fences.mjs';

const require = createRequire(import.meta.url);
const compiler = require('typescript-doc-contract');
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ciWorkflowUrl = new URL('../.github/workflows/ci.yml', import.meta.url);
const packageJsonUrl = new URL('../package.json', import.meta.url);
const rulesetUrl = new URL('../.github/rulesets/main.json', import.meta.url);

describe('API文書TypeScript fence契約', () => {
  it('API契約文書の41 blockを個別・連結とも診断0で検査する', async () => {
    const artifactDirectory = await mkdtemp(join(tmpdir(), 'jstqb-docs-contract-'));
    const artifactPath = join(artifactDirectory, 'api-contract-v2-fences.json');
    const result = await runDocsContractCheck({ artifactPath, compiler, rootDirectory: projectRoot });

    assert.equal(result.report.success, true, result.report.violations.join('\n'));
    assert.equal(result.report.blockCount, 41);
    assert.equal(result.report.typeScriptVersion, '5.9.3');
    assert.equal(result.report.individualParserDiagnosticCount, 0);
    assert.equal(result.report.virtualErrorDiagnosticCount, 0);
    assert.deepEqual(JSON.parse(await readFile(artifactPath, 'utf8')), result.report);
  });

  it('ordinalとMarkdown開始行をdocument-orderで記録する', () => {
    const blocks = extractTypeScriptFences('先頭\n```ts\nconst one = 1;\n```\n\n```typescript\nconst two = 2;\n```\n');

    assert.deepEqual(blocks.map((block) => ({
      language: block.language,
      markdownCodeStartLine: block.markdownCodeStartLine,
      markdownStartLine: block.markdownStartLine,
      ordinal: block.ordinal,
    })), [
      { language: 'ts', markdownCodeStartLine: 3, markdownStartLine: 2, ordinal: 1 },
      { language: 'typescript', markdownCodeStartLine: 7, markdownStartLine: 6, ordinal: 2 },
    ]);
  });

  it('個別parser診断とvirtual診断をfilterせずartifactへ残す', () => {
    const report = createDocsContractReport('```ts\nconst value: = 1;\n```\n', compiler, projectRoot);

    assert.equal(report.success, false);
    assert.ok(report.individualParserDiagnosticCount > 0);
    assert.ok(report.virtualErrorDiagnosticCount > 0);
    assert.equal(report.individualParserDiagnostics[0]?.ordinal, 1);
    assert.equal(report.individualParserDiagnostics[0]?.markdownStartLine, 1);
    assert.equal(report.virtualDiagnostics[0]?.ordinal, 1);
  });

  it('CRLFと末尾改行を含む第2・第3blockのvirtual診断を正しいMarkdown行へ対応付ける', () => {
    const markdown = [
      '```ts\r\n',
      'const first = 1;\r\n',
      '```\r\n',
      '```typescript\r\n',
      'const second: SecondMissingType = 1;\r\n',
      '```\r\n',
      '```ts\r\n',
      'const third: ThirdMissingType = 1;\r\n',
      '```\r\n',
    ].join('');
    const report = createDocsContractReport(markdown, compiler, projectRoot);
    const secondVirtualDiagnostic = report.virtualDiagnostics.find((diagnostic) => diagnostic.message.includes('SecondMissingType'));
    const thirdVirtualDiagnostic = report.virtualDiagnostics.find((diagnostic) => diagnostic.message.includes('ThirdMissingType'));
    const parserReport = createDocsContractReport('```ts\r\nconst broken: = 1;\r\n```\r\n', compiler, projectRoot);
    const parserDiagnostic = parserReport.individualParserDiagnostics[0];

    assert.equal(report.blocks[0]?.sourceLineCount, 2);
    assert.equal(report.blocks[1]?.sourceLineCount, 2);
    assert.equal(report.blocks[2]?.sourceLineCount, 2);
    assert.equal(report.virtualMappings[1]?.virtualStartLine, 3);
    assert.equal(report.virtualMappings[2]?.virtualStartLine, 5);
    assert.equal(parserDiagnostic?.ordinal, 1);
    assert.equal(parserDiagnostic?.markdownStartLine, 1);
    assert.equal(parserDiagnostic?.markdownLine, 2);
    assert.equal(secondVirtualDiagnostic?.ordinal, 2);
    assert.equal(secondVirtualDiagnostic?.markdownStartLine, 4);
    assert.equal(secondVirtualDiagnostic?.markdownLine, 5);
    assert.equal(thirdVirtualDiagnostic?.ordinal, 3);
    assert.equal(thirdVirtualDiagnostic?.markdownStartLine, 7);
    assert.equal(thirdVirtualDiagnostic?.markdownLine, 8);
  });

  it('最終blockのEOF parser診断もvirtualで同じordinalとMarkdown行へ対応付ける', () => {
    const markdown = [
      '```ts\n',
      'const valid = 1;\n',
      '```\n',
      '\n',
      '```ts\n',
      'function broken() {\n',
      '```\n',
    ].join('');
    const report = createDocsContractReport(markdown, compiler, projectRoot);
    const parserDiagnostic = report.individualParserDiagnostics.find((diagnostic) => diagnostic.ordinal === 2);
    const virtualDiagnostic = report.virtualDiagnostics.find((diagnostic) => diagnostic.code === parserDiagnostic?.code);

    assert.equal(parserDiagnostic?.ordinal, 2);
    assert.equal(parserDiagnostic?.markdownLine, 6);
    assert.equal(virtualDiagnostic?.ordinal, 2);
    assert.equal(virtualDiagnostic?.markdownStartLine, parserDiagnostic?.markdownStartLine);
    assert.equal(virtualDiagnostic?.markdownLine, parserDiagnostic?.markdownLine);
  });

  it('既存quality job内のdocs-contract stepとartifactへ接続する', async () => {
    const workflow = await readFile(ciWorkflowUrl, 'utf8');
    const qualityStart = workflow.indexOf('\n  quality:');
    const qualityEnd = workflow.indexOf('\n  e2e:', qualityStart);
    const qualityJob = workflow.slice(qualityStart, qualityEnd);
    const packageJson = JSON.parse(await readFile(packageJsonUrl, 'utf8'));
    const ruleset = JSON.parse(await readFile(rulesetUrl, 'utf8'));
    const statusRule = ruleset.rules.find((rule) => rule.type === 'required_status_checks');

    assert.match(qualityJob, /name: docs-contract/u);
    assert.match(qualityJob, /run: pnpm contract:check-api-ts-fences/u);
    assert.match(qualityJob, /DOCS_CONTRACT_ARTIFACT_PATH/u);
    assert.match(qualityJob, /name: docs-contract\n[\s\S]*path: \$\{\{ runner\.temp \}\}\/docs-contract\/api-contract-v2-fences\.json/u);
    assert.match(packageJson.scripts.check, /pnpm contract:check-api-ts-fences/u);
    assert.equal(packageJson.scripts['contract:check-api-ts-fences'], 'node scripts/check-doc-ts-fences.mjs');
    assert.deepEqual(statusRule.parameters.required_status_checks.map((check) => check.context).sort(), [
      'database',
      'e2e',
      'pages',
      'quality',
      'security',
    ]);
  });
});
