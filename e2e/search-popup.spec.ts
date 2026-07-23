import { test, expect } from '@playwright/test';
import { login } from './utils';

test.describe('Search popup', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByText('Chercher', { exact: true }).click();
  });

  // Regression test: the popup used to disable all three status buttons the
  // moment a book was owned under *any* status, with no way to switch — e.g.
  // an already-"to_read" book couldn't be marked "reading" from here.
  test('status buttons reflect the book\'s current status and allow switching it', async ({ page }) => {
    await page.getByPlaceholder('Titre, auteur, ISBN...').fill('Le Petit Prince');
    await page.keyboard.press('Enter');
    await expect(page.getByText(/résultats? pour/)).toBeVisible({ timeout: 15_000 });

    await page.getByText('Le Petit Prince', { exact: false }).first().click();

    const toRead = page.getByRole('button', { name: 'Ajouter à ma pile à lire' });
    const reading = page.getByRole('button', { name: 'Je suis en train de lire' });
    const done = page.getByRole('button', { name: 'Je l\'ai déjà lu' });
    await expect(toRead).toBeVisible({ timeout: 10_000 });
    await expect(reading).toBeVisible();
    await expect(done).toBeVisible();

    // Exactly one of the three reflects the book's current status (disabled);
    // the other two stay enabled so the status can be changed from here.
    const disabledFlags = await Promise.all(
      [toRead, reading, done].map(btn => btn.isDisabled()),
    );
    expect(disabledFlags.filter(Boolean).length).toBe(1);

    // Switch to a different status than whichever is currently active, then
    // confirm that one is now the disabled/current one.
    const notCurrent = [toRead, reading, done][disabledFlags.findIndex(d => !d)];
    await notCurrent.click();
    await expect(notCurrent).toBeDisabled({ timeout: 10_000 });
  });

  // Regression test: tapping the cover/title in the popup used to do
  // nothing (or only close the sheet) instead of opening the full detail
  // page.
  test('tapping the title in the popup opens the book detail page', async ({ page }) => {
    await page.getByPlaceholder('Titre, auteur, ISBN...').fill('Le Petit Prince');
    await page.keyboard.press('Enter');
    await expect(page.getByText(/résultats? pour/)).toBeVisible({ timeout: 15_000 });

    await page.getByText('Le Petit Prince', { exact: false }).first().click();
    await expect(page.getByText('Ajouter à ma liste').or(page.getByText('Ton statut'))).toBeVisible({ timeout: 10_000 });

    // The popup's title is the second occurrence of the book title on the
    // page (the first is the search result row underneath it).
    await page.getByText('Le Petit Prince', { exact: false }).last().click();
    await expect(page).toHaveURL(/\/book\//, { timeout: 10_000 });
  });

  // Regression test: navigating to a book's detail page from a search
  // result used to clear the query/results on the way back, since the
  // search screen cleared its own state on every blur (including this
  // round trip, not just switching tabs).
  test('search results survive a visit to a book detail page and back', async ({ page }) => {
    const search = page.getByPlaceholder('Titre, auteur, ISBN...');
    await search.fill('Le Petit Prince');
    await page.keyboard.press('Enter');
    await expect(page.getByText(/résultats? pour/)).toBeVisible({ timeout: 15_000 });

    await page.getByText('Le Petit Prince', { exact: false }).first().click();
    await page.getByText('Le Petit Prince', { exact: false }).last().click();
    await expect(page).toHaveURL(/\/book\//, { timeout: 10_000 });

    await page.goBack();
    await expect(search).toHaveValue('Le Petit Prince');
    await expect(page.getByText(/résultats? pour/)).toBeVisible({ timeout: 10_000 });
  });
});
