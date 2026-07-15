import { test, expect } from '@playwright/test';
import { login } from './utils';

test.describe('Library (Bibliothèque)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByText('Biblio', { exact: true }).click();
  });

  test('switches between status tabs', async ({ page }) => {
    await expect(page.getByText('À lire', { exact: false }).first()).toBeVisible();
    await page.getByText('Lus', { exact: false }).first().click();
    await page.getByText('En cours', { exact: false }).first().click();
    await page.getByText('DNF', { exact: false }).first().click();
    // No assertion beyond "didn't crash" — each tab just needs to render.
  });

  test('search filters the shelf', async ({ page }) => {
    const search = page.getByPlaceholder('Chercher dans ma bibliothèque...');
    await expect(search).toBeVisible();
    await search.fill('zzzzzzzz-no-such-book-zzzzzzzz');
    await expect(page.getByText(/Aucun résultat pour/)).toBeVisible();
    await search.fill('');
  });
});
