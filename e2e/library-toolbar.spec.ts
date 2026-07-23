import { test, expect } from '@playwright/test';
import { login, scrollAt } from './utils';

test.describe('Library toolbar (search bar + category pills)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByText('Biblio', { exact: true }).click();
    await page.getByLabel('Vue grille').click();
  });

  test('collapses on scroll down and reappears on scroll up', async ({ page }) => {
    const search = page.getByPlaceholder('Chercher dans ma bibliothèque...');
    await expect(search).toBeVisible();

    // Scroll the shelf/grid down hard enough to trigger the collapse — skip
    // rather than fail if this account doesn't have enough books to scroll
    // (the toolbar has nothing to make way for, so it correctly stays put).
    for (let i = 0; i < 6; i++) {
      await scrollAt(page, 200, 400, 600);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(400);

    const stillVisible = await search.isVisible().catch(() => false);
    test.skip(stillVisible, 'Not enough books in this account to scroll the toolbar out of view');

    await expect(search).not.toBeVisible();

    for (let i = 0; i < 6; i++) {
      await scrollAt(page, 200, 400, -600);
      await page.waitForTimeout(80);
    }
    await expect(search).toBeVisible({ timeout: 5_000 });
  });

  // Reorder ("edit") mode needs all the vertical room it can get, so the
  // toolbar stays collapsed there regardless of scroll position.
  test('stays hidden in edit mode', async ({ page }) => {
    const search = page.getByPlaceholder('Chercher dans ma bibliothèque...');
    await expect(search).toBeVisible();

    await page.getByLabel('Mode édition').click();
    await expect(search).not.toBeVisible();

    // First-ever entry into edit mode in a fresh browser context (no
    // EDIT_TUTORIAL_SEEN_KEY in localStorage yet) shows a one-time tutorial
    // overlay — dismiss it via its backdrop before trying to tap anything
    // underneath, the same way a real first-time user would.
    const tutorialTitle = page.getByText('Mode édition', { exact: true });
    if (await tutorialTitle.isVisible().catch(() => false)) {
      await page.mouse.click(10, 10);
      await expect(tutorialTitle).not.toBeVisible({ timeout: 5_000 });
    }

    // Leave edit mode again so other specs don't inherit it.
    await page.getByLabel('Mode édition').click();
    await expect(search).toBeVisible({ timeout: 5_000 });
  });
});
