import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { detectSecretFindings } from './check-secrets.mjs';

function createSupabaseServiceRoleJwt() {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: 'supabase', ref: 'project-ref', role: 'service_role' })).toString('base64url');
  const signature = Buffer.from('署名fixtureではなく検出専用の疑似値'.repeat(2)).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

describe('秘密情報パターン検出', () => {
  it('Supabaseのservice_role JWTを変数名に依存せず検出する', () => {
    const findings = detectSecretFindings(`const admin = '${createSupabaseServiceRoleJwt()}';`);
    assert.ok(findings.includes('高権限JWT（role=service_role）'));
  });

  it('各社の高危険token形式を検出する', () => {
    const tokens = [
      ['ghp', 'A'.repeat(36)].join('_'),
      ['github', 'pat', 'B'.repeat(30)].join('_'),
      ['sk', 'C'.repeat(30)].join('-'),
      ['AKIA', 'D'.repeat(16)].join(''),
      ['AIza', 'E'.repeat(35)].join(''),
      ['xoxb', '1234567890', 'F'.repeat(24)].join('-'),
      ['sk', 'live', 'G'.repeat(24)].join('_'),
      ['npm', 'H'.repeat(36)].join('_'),
      ['hf', 'I'.repeat(32)].join('_'),
      ['sb', 'secret', 'J'.repeat(28)].join('_'),
    ];
    const findings = detectSecretFindings(tokens.join('\n'));
    for (const expected of [
      'GitHubトークン',
      'OpenAI APIキー',
      'AWSアクセスキー',
      'Google APIキー',
      'Slackトークン',
      'Stripe秘密キー',
      'npmトークン',
      'Hugging Faceトークン',
      'Supabase秘密キー',
    ]) {
      assert.ok(findings.includes(expected), `${expected}を検出できませんでした。`);
    }
  });

  it('機密名へ代入された未知の高エントロピー値を検出する', () => {
    const highEntropyValue = Buffer.from(Array.from({ length: 64 }, (_, index) => (index * 73 + 41) % 256)).toString('base64url');
    const findings = detectSecretFindings(`const partnerCredential = '${highEntropyValue}';`);
    assert.ok(findings.includes('機密名へ代入された高エントロピー値'));
  });

  it('公開可能なSupabase publishable keyとfixture値は許可する', () => {
    const findings = detectSecretFindings("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture-value'");
    assert.deepEqual(findings, []);
  });

  it('template interpolationを固定secret literalと誤検知しない', () => {
    const findings = detectSecretFindings('const activeStorageKey = `${snapshotKeyPrefix}:guest`;');
    assert.deepEqual(findings, []);
  });

  it('異種quoteを含むsingle・double・backtickのsecret代入を検出する', () => {
    const highEntropyValue = Buffer.from(Array.from({ length: 64 }, (_, index) => (index * 73 + 41) % 256)).toString('base64url');
    const source = [
      `secret='${highEntropyValue}"'`,
      `token="${highEntropyValue}'"`,
      `password=\`${highEntropyValue}'\``,
    ].join('\n');

    assert.ok(detectSecretFindings(source).includes('機密名へ代入された高エントロピー値'));
  });

  it('template式内のquoted高エントロピーliteralを検出する', () => {
    const highEntropyValue = Buffer.from(Array.from({ length: 64 }, (_, index) => (index * 73 + 41) % 256)).toString('base64url');
    const source = `const secret = \`\${readSecret("${highEntropyValue}")}\`;`;

    assert.ok(detectSecretFindings(source).includes('機密名へ代入された高エントロピー値'));
  });

  it('秘密履歴scanをHEAD到達履歴に限定する', async () => {
    const source = await readFile(new URL('./check-secrets.mjs', import.meta.url), 'utf8');
    assert.match(source, /rev-list', '--objects', 'HEAD'/u);
    assert.doesNotMatch(source, /rev-list', '--objects', '--all'/u);
  });
});
