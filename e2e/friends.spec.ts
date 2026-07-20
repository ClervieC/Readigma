import { test, expect } from '@playwright/test';
import { login } from './utils';

test.describe('Follows (Amis lecteurs)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/friends');
  });

  test('switches between Abonnements / Abonnés / Chercher', async ({ page }) => {
    await expect(page.getByText('Amis lecteurs')).toBeVisible();
    await page.getByText('Chercher', { exact: true }).click();
    await expect(page.getByPlaceholder('Chercher un lecteur...')).toBeVisible();
    // Tab labels get a trailing " (N)" once there's at least one entry, so
    // an exact match would be brittle against a real, mutating test account.
    await page.getByText(/^Abonnés/).click();
    await page.getByText(/^Abonnements/).click();
  });

  test('empty state "Chercher des lecteurs" button switches to the search tab', async ({ page }) => {
    const emptyCta = page.getByText('Chercher des lecteurs');
    if (await emptyCta.count()) {
      await emptyCta.click();
      await expect(page.getByPlaceholder('Chercher un lecteur...')).toBeVisible();
    }
  });
});
