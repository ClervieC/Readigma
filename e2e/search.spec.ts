import { test, expect } from '@playwright/test';
import { login } from './utils';

test.describe('Search (Chercher)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByText('Chercher', { exact: true }).click();
  });

  test('finds books by title', async ({ page }) => {
    await page.getByPlaceholder('Titre, auteur, ISBN...').fill('Harry Potter');
    await page.keyboard.press('Enter');
    await expect(page.getByText(/résultats pour/)).toBeVisible({ timeout: 15_000 });
  });

  test('"Populaires sur Readigma" renders as a horizontal row', async ({ page }) => {
    const section = page.getByText('Populaires sur Readigma');
    await expect(section).toBeVisible({ timeout: 15_000 });
  });

  // Regression test: popular_books() used to omit external_id, so adding a
  // book from this section 400'd (upsert tried to insert a new `books` row
  // with a null external_id instead of recognizing the existing one).
  test('can add a book from "Populaires sur Readigma" without an error', async ({ page }) => {
    const heading = page.getByText('Populaires sur Readigma');
    await expect(heading).toBeVisible({ timeout: 15_000 });

    const apiErrors: number[] = [];
    page.on('response', res => {
      if (res.url().includes('/rest/v1/books') && !res.ok()) apiErrors.push(res.status());
    });

    // The heading and its HorizontalBooks row are siblings under the same
    // wrapping <View> (see app/(tabs)/search.tsx), so the row is the
    // heading's immediate next sibling.
    const row = heading.locator('xpath=following-sibling::*[1]');
    const firstCover = row.locator('img').first();
    if (await firstCover.count()) {
      await firstCover.click();
    } else {
      await row.locator(':scope > *').first().click();
    }

    const addButton = page.getByText('Ajouter à ma pile à lire');
    await expect(addButton.or(page.getByText('Déjà ajouté'))).toBeVisible({ timeout: 10_000 });
    if (await addButton.count()) {
      await addButton.click();
      await page.waitForTimeout(1000);
    }

    expect(apiErrors, `Unexpected /rest/v1/books error responses: ${apiErrors.join(', ')}`).toEqual([]);
  });
});
