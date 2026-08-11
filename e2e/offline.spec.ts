import { expect, test } from '@playwright/test';

import { chooseFirstAnswer, openHome, startQuickSession } from './helpers';

async function waitForServiceWorkerControl(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
    });
  });
}

test('オフライン再読み込み後も未確定回答を復元し、オンラインへ戻せる', async ({ context, page }) => {
  await openHome(page);
  await waitForServiceWorkerControl(page);
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

test('認証付きAPI応答をキャッシュせず、利用者切替時に前利用者の応答を返さない', async ({ context, page }) => {
  await openHome(page);
  await waitForServiceWorkerControl(page);
  await page.reload();

  const firstUser = await page.evaluate(async () => {
    const response = await fetch('http://127.0.0.1:4174/account/profile', {
      headers: { Authorization: 'Bearer user-A' },
    });
    return response.json() as Promise<{ owner: string }>;
  });
  expect(firstUser.owner).toBe('Bearer user-A');

  const cachedApiUrls = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      urls.push(...(await cache.keys()).map((request) => request.url));
    }
    return urls.filter((url) => url.includes('/account/profile'));
  });
  expect(cachedApiUrls).toEqual([]);

  await context.setOffline(true);
  try {
    const leakedResponse = await page.evaluate(async () => {
      try {
        const response = await fetch('http://127.0.0.1:4174/account/profile', {
          headers: { Authorization: 'Bearer user-B' },
        });
        return await response.json() as { owner: string };
      } catch {
        return null;
      }
    });
    expect(leakedResponse).toBeNull();
  } finally {
    await context.setOffline(false);
  }

  const secondUser = await page.evaluate(async () => {
    const response = await fetch('http://127.0.0.1:4174/account/profile', {
      headers: { Authorization: 'Bearer user-B' },
    });
    return response.json() as Promise<{ owner: string }>;
  });
  expect(secondUser.owner).toBe('Bearer user-B');
});

test('同一オリジンでも認証情報付きAPIと非GET応答をキャッシュしない', async ({ context, page }) => {
  await context.addCookies([{
    name: 'session',
    value: 'user-A',
    domain: '127.0.0.1',
    path: '/',
  }]);
  await openHome(page);
  await waitForServiceWorkerControl(page);
  await page.reload();

  const profile = await page.evaluate(async () => {
    const response = await fetch('/__e2e__/account/profile', {
      headers: { Authorization: 'Bearer user-A' },
    });
    return response.json() as Promise<{ authorization: string; cookie: string; method: string }>;
  });
  expect(profile).toEqual({
    authorization: 'Bearer user-A',
    cookie: 'session=user-A',
    method: 'GET',
  });

  const report = await page.evaluate(async () => {
    const response = await fetch('/__e2e__/account/profile', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-A', 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: '問題報告' }),
    });
    return response.json() as Promise<{ method: string }>;
  });
  expect(report.method).toBe('POST');

  const cachedApiUrls = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      urls.push(...(await cache.keys()).map((request) => request.url));
    }
    return urls.filter((url) => url.includes('/__e2e__/account/profile'));
  });
  expect(cachedApiUrls).toEqual([]);

  await context.setOffline(true);
  try {
    const response = await page.evaluate(async () => {
      try {
        await fetch('/__e2e__/account/profile', { headers: { Authorization: 'Bearer user-B' } });
        return '応答あり';
      } catch {
        return '通信失敗';
      }
    });
    expect(response).toBe('通信失敗');
  } finally {
    await context.setOffline(false);
  }
});
