/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import fixtures from '../scripts/fixtures/uri-query-contract.json';

test('Metro bundle preserves Router query contracts in the browser', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const bundle = testInfo.outputPath('uri-query.js');
  execFileSync(process.execPath, ['scripts/build-uri-query-fixture.mjs', bundle], {
    timeout: 90_000,
    stdio: 'pipe',
  });
  // An isolated blank browser avoids touching app state or real services.
  await page.goto('about:blank');
  await page.addScriptTag({ path: bundle });
  // Serialize in the browser so Playwright's object transport cannot drop __proto__ data keys.
  const result = await page.evaluate<string>('JSON.stringify(globalThis.__uriQueryResults)');
  expect(JSON.parse(result)).toEqual({
    parsed: fixtures.parse.filter(f => !f.options).map(f => ({ sessionId: 'synthetic', ...f.expected })),
    generated: '/practice/synthetic?tag=a&tag=b&q=%E6%97%A5%E6%9C%AC%20%2B&empty=',
    coreGenerated: '/practice/synthetic?q=%E6%97%A5%E6%9C%AC%20%2B&empty=',
    withHash: '/practice/synthetic?q=a%2Bb#section',
    large: '%FE'.repeat(20000),
  });
});
