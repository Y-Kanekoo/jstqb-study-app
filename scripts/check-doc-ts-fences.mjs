import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const expectedBlockCount = 41;
const expectedTypeScriptVersion = '5.9.3';
const artifactName = 'docs-contract';
const documentRelativePath = 'docs/api-contract-v2.md';
const virtualFileRelativePath = 'docs/api-contract-v2.fences.virtual.ts';

function countLineBreaks(value) {
  return [...value.matchAll(/\r\n|\r|\n/gu)].length;
}

function toSourceText(value) {
  return value.endsWith('\n') || value.endsWith('\r') ? value : `${value}\n`;
}

function diagnosticCategoryName(compiler, category) {
  return compiler.DiagnosticCategory[category] ?? 'Unknown';
}

function diagnosticMessage(compiler, diagnostic) {
  return compiler.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
}

function countSourceLines(value) {
  return countLineBreaks(value) + 1;
}

export function extractTypeScriptFences(markdown) {
  const fencePattern = /^```(?<language>ts|typescript)[ \t]*\r?\n(?<source>[\s\S]*?)^```[ \t]*\r?$/gmu;
  const blocks = [];
  let match;

  while ((match = fencePattern.exec(markdown)) !== null) {
    const openingFenceStart = match.index ?? 0;
    const markdownStartLine = countLineBreaks(markdown.slice(0, openingFenceStart)) + 1;
    const sourceText = toSourceText(match.groups?.source ?? '');
    blocks.push({
      ordinal: blocks.length + 1,
      language: match.groups?.language ?? '',
      markdownStartLine,
      markdownCodeStartLine: markdownStartLine + 1,
      sourceLineCount: countSourceLines(sourceText),
      sourceText,
    });
  }

  return blocks;
}

function createVirtualSource(blocks) {
  let nextVirtualLine = 1;
  const mappings = [];
  const sourceParts = [];

  for (const [index, block] of blocks.entries()) {
    mappings.push({
      ordinal: block.ordinal,
      markdownStartLine: block.markdownStartLine,
      markdownCodeStartLine: block.markdownCodeStartLine,
      virtualStartLine: nextVirtualLine,
      sourceLineCount: block.sourceLineCount,
    });
    sourceParts.push(block.sourceText);
    if (index < blocks.length - 1) sourceParts.push('\n');
    // block間だけseparatorを置く。最終block後へは追加せず、EOF診断もblock範囲に対応付ける。
    nextVirtualLine += block.sourceLineCount;
  }

  return { mappings, sourceText: sourceParts.join('') };
}

function findVirtualMapping(mappings, virtualLine) {
  for (const mapping of mappings) {
    const virtualEndLine = mapping.virtualStartLine + mapping.sourceLineCount;
    if (virtualLine >= mapping.virtualStartLine && virtualLine < virtualEndLine) return mapping;
  }
  return null;
}

function serializeDiagnostic(compiler, diagnostic, sourceFile, sourceKind, mapping) {
  let line = null;
  let column = null;
  let markdownLine = null;
  let markdownColumn = null;

  if (sourceFile && typeof diagnostic.start === 'number') {
    const location = sourceFile.getLineAndCharacterOfPosition(diagnostic.start);
    line = location.line + 1;
    column = location.character + 1;
    if (mapping) {
      const relativeLine = typeof mapping.virtualStartLine === 'number'
        ? location.line - (mapping.virtualStartLine - 1)
        : location.line;
      const finalSourceLine = Math.max(0, (mapping.sourceLineCount ?? 1) - 2);
      markdownLine = mapping.markdownCodeStartLine + Math.min(relativeLine, finalSourceLine);
      markdownColumn = column;
    }
  }

  return {
    sourceKind,
    ordinal: mapping?.ordinal ?? null,
    markdownStartLine: mapping?.markdownStartLine ?? null,
    markdownLine,
    markdownColumn,
    code: diagnostic.code,
    category: diagnosticCategoryName(compiler, diagnostic.category),
    line,
    column,
    message: diagnosticMessage(compiler, diagnostic),
  };
}

function createCompilerOptions(compiler) {
  return {
    strict: true,
    exactOptionalPropertyTypes: true,
    noUncheckedIndexedAccess: true,
    noEmit: true,
    skipLibCheck: false,
    target: compiler.ScriptTarget.ES2022,
    module: compiler.ModuleKind.NodeNext,
    moduleResolution: compiler.ModuleResolutionKind.NodeNext,
    lib: ['lib.es2022.d.ts'],
  };
}

function createCompilerOptionsArtifact() {
  return {
    exactOptionalPropertyTypes: true,
    lib: ['ES2022'],
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    noEmit: true,
    noUncheckedIndexedAccess: true,
    skipLibCheck: false,
    strict: true,
    target: 'ES2022',
  };
}

function compileVirtualSource(compiler, rootDirectory, blocks) {
  const virtualFileName = resolve(rootDirectory, virtualFileRelativePath);
  const virtualSource = createVirtualSource(blocks);
  const options = createCompilerOptions(compiler);
  const host = compiler.createCompilerHost(options, true);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  const originalFileExists = host.fileExists.bind(host);
  const originalReadFile = host.readFile.bind(host);
  const virtualSourceFile = compiler.createSourceFile(
    virtualFileName,
    virtualSource.sourceText,
    compiler.ScriptTarget.ES2022,
    true,
    compiler.ScriptKind.TS,
  );

  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => (
    fileName === virtualFileName
      ? virtualSourceFile
      : originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile)
  );
  host.fileExists = (fileName) => fileName === virtualFileName || originalFileExists(fileName);
  host.readFile = (fileName) => fileName === virtualFileName ? virtualSource.sourceText : originalReadFile(fileName);

  const program = compiler.createProgram([virtualFileName], options, host);
  const diagnostics = compiler.getPreEmitDiagnostics(program);
  const programSourceFile = program.getSourceFile(virtualFileName) ?? virtualSourceFile;

  return {
    diagnostics: diagnostics.map((diagnostic) => {
      let mapping = null;
      if (typeof diagnostic.start === 'number') {
        const location = programSourceFile.getLineAndCharacterOfPosition(diagnostic.start);
        mapping = findVirtualMapping(virtualSource.mappings, location.line + 1);
      }
      return serializeDiagnostic(compiler, diagnostic, programSourceFile, 'virtual', mapping);
    }),
    mappings: virtualSource.mappings,
  };
}

export function createDocsContractReport(markdown, compiler, rootDirectory = projectRoot) {
  const blocks = extractTypeScriptFences(markdown);
  const parserDiagnostics = [];

  for (const block of blocks) {
    const sourceFile = compiler.createSourceFile(
      `${virtualFileRelativePath}.${block.ordinal}.ts`,
      block.sourceText,
      compiler.ScriptTarget.ES2022,
      true,
      compiler.ScriptKind.TS,
    );
    const mapping = {
      ordinal: block.ordinal,
      markdownStartLine: block.markdownStartLine,
      markdownCodeStartLine: block.markdownCodeStartLine,
      sourceLineCount: block.sourceLineCount,
    };
    for (const diagnostic of sourceFile.parseDiagnostics) {
      parserDiagnostics.push(serializeDiagnostic(compiler, diagnostic, sourceFile, 'parser', mapping));
    }
  }

  const virtualCompilation = compileVirtualSource(compiler, rootDirectory, blocks);
  const violations = [];
  if (compiler.version !== expectedTypeScriptVersion) {
    violations.push(`TypeScriptのバージョンが契約と異なります。期待値: ${expectedTypeScriptVersion}、実際: ${compiler.version}。`);
  }
  if (blocks.length !== expectedBlockCount) {
    violations.push(`TypeScript fence数が契約と異なります。期待値: ${expectedBlockCount}、実際: ${blocks.length}。`);
  }
  if (parserDiagnostics.length > 0) {
    violations.push(`個別parser diagnosticsが${parserDiagnostics.length}件あります。`);
  }
  if (virtualCompilation.diagnostics.length > 0) {
    violations.push(`ordinal連結virtual fileのdiagnosticsが${virtualCompilation.diagnostics.length}件あります。`);
  }

  return {
    artifactName,
    blockCount: blocks.length,
    blocks: blocks.map((block) => ({
      language: block.language,
      markdownCodeStartLine: block.markdownCodeStartLine,
      markdownStartLine: block.markdownStartLine,
      ordinal: block.ordinal,
      sourceLineCount: block.sourceLineCount,
    })),
    compilerOptions: createCompilerOptionsArtifact(),
    document: documentRelativePath,
    expectedBlockCount,
    individualParserDiagnosticCount: parserDiagnostics.length,
    individualParserDiagnostics: parserDiagnostics,
    schemaVersion: 1,
    success: violations.length === 0,
    typeScriptVersion: compiler.version,
    violations,
    virtualDiagnostics: virtualCompilation.diagnostics,
    virtualErrorDiagnosticCount: virtualCompilation.diagnostics.length,
    virtualMappings: virtualCompilation.mappings,
  };
}

export function defaultArtifactPath() {
  const baseDirectory = process.env.RUNNER_TEMP || tmpdir();
  return join(baseDirectory, 'jstqb-study-app', artifactName, 'api-contract-v2-fences.json');
}

export async function runDocsContractCheck({
  artifactPath = process.env.DOCS_CONTRACT_ARTIFACT_PATH || defaultArtifactPath(),
  compiler = require('typescript-doc-contract'),
  documentPath = join(projectRoot, documentRelativePath),
  rootDirectory = projectRoot,
} = {}) {
  const markdown = await readFile(documentPath, 'utf8');
  const report = createDocsContractReport(markdown, compiler, rootDirectory);
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return { artifactPath, report };
}

async function main() {
  try {
    const { artifactPath, report } = await runDocsContractCheck();
    if (!report.success) {
      console.error(`docs-contract検査に失敗しました。${report.violations.join(' ')}`);
      console.error(`診断artifact: ${artifactPath}`);
      process.exitCode = 1;
      return;
    }
    console.log(`docs-contract検査に成功しました。fence=${report.blockCount}、TypeScript=${report.typeScriptVersion}、artifact=${artifactPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明な検査エラーです。';
    console.error(`docs-contract検査を実行できませんでした: ${message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
