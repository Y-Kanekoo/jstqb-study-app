import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

const basePath = (process.env.E2E_BASE_PATH ?? '').trim().replace(/\/$/u, '');

export function appPath(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${basePath}${normalizedPath}` || '/';
}

export async function openHome(page: Page): Promise<void> {
  await page.goto(appPath('/'));
  await expect(page.getByRole('heading', { name: '今日も、ひとつずつ。' })).toBeVisible();
}

export async function startQuickSession(page: Page): Promise<void> {
  await page.getByRole('button', { name: '10問をはじめる' }).click();
  await expect(page.getByText(/問題 1/u)).toBeVisible();
  await expect(page.getByRole('radio').first()).toBeVisible();
}

export async function chooseFirstAnswer(page: Page): Promise<void> {
  const choice = page.getByRole('radio').first();
  await choice.click();
  await expect(choice).toBeChecked();
  await expect(page.getByText('この問題まで保存済み')).toBeVisible();
}
