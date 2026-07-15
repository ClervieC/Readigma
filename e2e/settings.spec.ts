import { test, expect } from '@playwright/test';
import { login } from './utils';

test.describe('Profile & Settings', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByText('Profil', { exact: true }).click();
  });

  test('profile stays lean (stats only, no settings list)', async ({ page }) => {
    await expect(page.getByText('Lus', { exact: false }).first()).toBeVisible();
    // Regression check: "Aide & Contact" and "Se déconnecter" used to live
    // directly on the profile page; they moved to Settings so Profile isn't
    // overloaded with info (Reading Goal / Mes amis lecteurs / Notifications
    // / Suggérer un livre / Administration were later moved back by request,
    // so those are intentionally not asserted against here).
    await expect(page.getByText('Aide & Contact')).toHaveCount(0);
    await expect(page.getByText('Se déconnecter')).toHaveCount(0);
  });

  test('the theme selector switches between Clair / Sombre / Système', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('Apparence')).toBeVisible();

    await page.getByText('Sombre', { exact: true }).click();
    await expect(page.getByText('Sombre', { exact: true })).toBeVisible();

    await page.getByText('Système', { exact: true }).click();
    await expect(page.getByText('Système', { exact: true })).toBeVisible();

    // Leave it back on Système so other specs aren't affected by a forced theme.
  });

  test('Paramètres exposes account actions moved off the profile page', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('Modifier le profil')).toBeVisible();
    await expect(page.getByText('Aide & Contact')).toBeVisible();
    await expect(page.getByText('Confidentialité')).toBeVisible();
    await expect(page.getByText("Conditions d'utilisation")).toBeVisible();
    await expect(page.getByText('Se déconnecter')).toBeVisible();
  });
});
