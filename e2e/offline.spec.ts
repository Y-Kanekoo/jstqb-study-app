import { expect, test } from '@playwright/test';

import { chooseFirstAnswer, openHome, startQuickSession } from './helpers';

test('オフライン再読み込み後も未確定回答を復元し、オンラインへ戻せる', async ({ context, page }) => {
  await openHome(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await startQuickSession(page);
  await chooseFirstAnswer(page);

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByRole('radio').first()).toBeChecked();
  } finally {
    await context.setOffline(false);
  }

  await page.reload();
  await expect(page.getByRole('radio').first()).toBeChecked();
  await expect(page.getByText('この問題まで保存済み')).toBeVisible();
});
