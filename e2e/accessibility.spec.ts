import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { openHome, startQuickSession } from './helpers';

async function expectNoSeriousAccessibilityViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).analyze();
  const blocking = result.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious');
  const details = blocking.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.flatMap((node) => node.target),
  }));
  expect(details).toEqual([]);
}

test('ホームと問題画面に重大な自動アクセシビリティ違反がない', async ({ page }) => {
  await openHome(page);
  await expectNoSeriousAccessibilityViolations(page);

  await startQuickSession(page);
  await expectNoSeriousAccessibilityViolations(page);
});

test('320px幅でも問題回答に横方向の欠落がない', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openHome(page);
  await startQuickSession(page);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByRole('radio').first()).toBeVisible();
  await expect(page.getByRole('button', { name: '回答を確定する' })).toBeVisible();
});
