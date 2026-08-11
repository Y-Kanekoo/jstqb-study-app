import { expect, test } from '@playwright/test';

import { chooseFirstAnswer, openHome, startQuickSession } from './helpers';
import { chapterOneWrongAnswerFixture } from './fixtures';

test.describe('1問単位の保存と学習履歴', () => {
  test('未確定の選択を再読み込み後に復元し、確定した1問を履歴へ反映する', async ({ page }) => {
    await openHome(page);
    await startQuickSession(page);
    await chooseFirstAnswer(page);

    await page.reload();
    await expect(page.getByRole('radio').first()).toBeChecked();

    await page.getByRole('button', { name: '回答を確定する' }).click();
    await expect(page.getByText(/正解です|もう一度、整理しましょう/u)).toBeVisible();

    await page.goto('/records');
    const totalAnswers = page.getByText('総回答').locator('..');
    await expect(totalAnswers).toContainText('1');
    await expect(totalAnswers).toContainText('問');
  });

  test('複数の中断セッションを上書きせずホームへ表示する', async ({ page }) => {
    await openHome(page);
    await startQuickSession(page);
    await page.getByRole('button', { name: '終了' }).click();
    await expect(page.getByRole('heading', { name: '今日も、ひとつずつ。' })).toBeVisible();

    await startQuickSession(page);
    await page.getByRole('button', { name: '終了' }).click();

    await expect(page.getByText('2件の学習中')).toBeVisible();
    await expect(page.getByRole('button', { name: '続きから再開' })).toHaveCount(2);
  });
});

test.describe('誤答フィルター', () => {
  test('誤答を未克服と過去すべての両方から開始できる', async ({ page }) => {
    await page.goto('/learn');
    await expect(page.getByRole('heading', { name: '学ぶ' })).toBeVisible();
    await page.getByRole('button', { name: 'この章を学ぶ' }).first().click();

    await expect(page.getByRole('heading', { name: chapterOneWrongAnswerFixture.prompt })).toBeVisible();
    const incorrectChoice = page.getByRole('radio').filter({ hasText: chapterOneWrongAnswerFixture.incorrectChoice });
    await incorrectChoice.click();
    await expect(incorrectChoice).toBeChecked();
    await page.getByRole('button', { name: '回答を確定する' }).click();
    await expect(page.getByText('もう一度、整理しましょう')).toBeVisible();

    await page.goto('/wrong');
    await expect(page.getByRole('heading', { name: '誤答だけを解く' })).toBeVisible();
    await expect(page.getByText('1問を出題できます')).toBeVisible();

    await page.getByRole('button', { name: '過去すべて' }).click();
    await expect(page.getByRole('button', { name: '過去すべて' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('1問を出題できます')).toBeVisible();
    await page.getByRole('button', { name: '誤答トレーニングを開始' }).click();
    await expect(page.getByText(/過去すべての問題/u)).toBeVisible();
  });
});
