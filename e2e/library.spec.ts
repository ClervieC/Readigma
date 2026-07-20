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

// The un-zoomed "shelf" view mode opens on RoomView (see app/(tabs)/library.tsx) —
// assets/salon.jpg with one tappable zone per status. viewMode is persisted on
// the profile, so a previous test/run may have left it on "grid"; forcing
// "Vue étagère" here makes these independent of that leftover state instead
// of assuming a fresh account.
test.describe('Library room view (salon)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByText('Biblio', { exact: true }).click();
    await page.getByLabel('Vue étagère').click();
  });

  test('shows the room illustration with one tappable zone per status', async ({ page }) => {
    await expect(page.getByText("Touche une bibliothèque pour l'ouvrir")).toBeVisible();
    await expect(page.getByLabel('À lire')).toBeVisible();
    await expect(page.getByLabel('En cours')).toBeVisible();
    await expect(page.getByLabel('Lu')).toBeVisible();
    await expect(page.getByLabel('DNF')).toBeVisible();
  });

  test('tapping a zone opens that status\'s shelf, and "Retour au salon" comes back', async ({ page }) => {
    await page.getByLabel('À lire').click();
    await expect(page.getByPlaceholder('Chercher dans ma bibliothèque...')).toBeVisible();
    await expect(page.getByText("Touche une bibliothèque pour l'ouvrir")).not.toBeVisible();

    await page.getByText('Retour au salon').click();
    await expect(page.getByText("Touche une bibliothèque pour l'ouvrir")).toBeVisible();
  });
});
