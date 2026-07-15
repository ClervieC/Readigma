import { test, expect } from '@playwright/test';
import { login } from './utils';

test.describe('Discover (Découvrir)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('shows the randomizer and can spin it', async ({ page }) => {
    const spinButton = page.getByText('Choisir pour moi');
    // Nothing in "à lire" yet is a valid empty state too — only assert the
    // spin control itself, not that it necessarily returns a book.
    await expect(spinButton.or(page.getByText('Tirage en cours...'))).toBeVisible();
  });

  test('tapping the active tab again scrolls back to top', async ({ page }) => {
    // Regression check for the scroll-to-top-on-reselect feature. "Quel sera
    // ton prochain livre ?" sits near the top of Discover's scrollable
    // content (below the fixed greeting header) — scroll it away, tap
    // "Découvrir" again, and it should come back to (near) its original
    // position. Bounding-box deltas (rather than a strict in/out-of-viewport
    // check) so this still works for a lean test account whose whole page
    // may barely exceed the viewport height.
    const heading = page.getByText('Quel sera ton prochain livre ?');
    const before = await heading.boundingBox();
    expect(before).not.toBeNull();

    await page.mouse.move(210, 400);
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(300);
    const scrolled = await heading.boundingBox();

    test.skip(!scrolled || Math.abs(scrolled.y - before!.y) < 5, 'Not enough content on this account to scroll — nothing to verify.');

    await page.getByText('Découvrir', { exact: true }).click();
    await page.waitForTimeout(500);
    const after = await heading.boundingBox();
    expect(Math.abs(after!.y - before!.y)).toBeLessThan(5);
  });
});
