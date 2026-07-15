import { test, expect } from '@playwright/test';
import { login } from './utils';

test.describe('Friends (Amis lecteurs)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/friends');
  });

  test('switches between Mes amis / Chercher / Demandes', async ({ page }) => {
    await expect(page.getByText('Amis lecteurs')).toBeVisible();
    await page.getByText('Chercher', { exact: true }).click();
    await expect(page.getByPlaceholder('Chercher un lecteur...')).toBeVisible();
    await page.getByText('Demandes', { exact: true }).click();
    await page.getByText('Mes amis', { exact: true }).click();
  });

  test('empty state "Chercher des lecteurs" button switches to the search tab', async ({ page }) => {
    const emptyCta = page.getByText('Chercher des lecteurs');
    if (await emptyCta.count()) {
      await emptyCta.click();
      await expect(page.getByPlaceholder('Chercher un lecteur...')).toBeVisible();
    }
  });
});
