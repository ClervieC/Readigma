import { test, expect, Page } from '@playwright/test';
import { login, scrollAt } from './utils';

// Rapid-fire interaction tests — not about a single feature, but about
// whether the app stays coherent (no crash, no console error, no stuck
// state) when a user mashes buttons or fires actions faster than their
// network responses can settle. Deliberately doesn't wait between actions
// the way the rest of the suite does.

// Transient HTTP failures from the live third-party book APIs (Open
// Library/Google Books/BnF — see lib/books.ts) are expected background
// noise when a test deliberately fires several searches back to back; they
// reflect those services' own rate limiting, not a bug in this app. Real
// app-level JS errors/exceptions are what these tests actually care about.
const isExternalNetworkNoise = (text: string) =>
  /Failed to load resource: the server responded with a status of \d+/.test(text);

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !isExternalNetworkNoise(msg.text())) errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));
  return errors;
}

const TABS = ['Découvrir', 'Fil', 'Biblio', 'Chercher', 'Profil'];

test.describe('Stress', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('rapid tab switching does not error or get the app stuck', async ({ page }) => {
    const errors = trackErrors(page);

    for (let round = 0; round < 4; round++) {
      for (const tab of TABS) {
        // .first() — RN Web occasionally renders a second off-screen text
        // node for the same label (e.g. during a layout transition), which
        // makes an exact-match locator ambiguous under Playwright's strict
        // mode; the visible tab bar item is always the first match.
        await page.getByText(tab, { exact: true }).first().click();
        // No wait — the point is firing the next nav before the previous
        // screen's data fetch has necessarily resolved.
      }
    }

    // TABS's last entry is 'Profil' — should land cleanly there.
    await expect(page.getByText('Lus', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    expect(errors, `Console errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('mashing the Discover spin button does not fire overlapping picks', async ({ page }) => {
    const errors = trackErrors(page);
    await page.getByText('Découvrir', { exact: true }).click();

    const spinButton = page.getByText('Choisir pour moi');
    const emptyState = page.getByText('Aucun livre trouvé');
    await expect(spinButton.or(emptyState)).toBeVisible({ timeout: 10_000 });
    test.skip(await emptyState.isVisible(), 'Empty "to read" pile on this account — nothing to spin.');

    // spin() guards on its own `spinning` flag — mashing this should not
    // throw, and should settle into a single stable result, not toggle
    // forever between "Tirage en cours..." and a picked book.
    for (let i = 0; i < 8; i++) {
      await spinButton.click({ force: true }).catch(() => {});
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(2000);

    const stillSpinning = await page.getByText('Tirage en cours...').isVisible().catch(() => false);
    expect(stillSpinning).toBe(false);
    expect(errors, `Console errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('rapidly typing and clearing a search query settles without error', async ({ page }) => {
    const errors = trackErrors(page);
    await page.getByText('Chercher', { exact: true }).click();
    const search = page.getByPlaceholder('Titre, auteur, ISBN...');

    const queries = ['Harry', 'Harry Pot', 'Le Petit Prince', 'Dune', ''];
    for (const q of queries) {
      await search.fill(q);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(100); // fires the next query well before this one's response lands
    }

    await search.fill('Dune');
    await page.keyboard.press('Enter');
    await expect(page.getByText(/résultats? pour/).or(page.getByText(/Aucun résultat pour/))).toBeVisible({ timeout: 15_000 });
    expect(errors, `Console errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('opening and closing the search result popup repeatedly does not leak state', async ({ page }) => {
    const errors = trackErrors(page);
    await page.getByText('Chercher', { exact: true }).click();
    await page.getByPlaceholder('Titre, auteur, ISBN...').fill('Le Petit Prince');
    await page.keyboard.press('Enter');
    await expect(page.getByText(/résultats? pour/)).toBeVisible({ timeout: 15_000 });

    const result = page.getByText('Le Petit Prince', { exact: false }).first();
    for (let i = 0; i < 5; i++) {
      await result.click();
      await expect(page.getByText('Ajouter à ma liste').or(page.getByText('Ton statut'))).toBeVisible({ timeout: 10_000 });
      // Dismiss via the overlay rather than waiting for any settle.
      await page.mouse.click(10, 10);
      await page.waitForTimeout(100);
    }

    // The search itself should have survived all that open/close churn.
    await expect(page.getByPlaceholder('Titre, auteur, ISBN...')).toHaveValue('Le Petit Prince');
    expect(errors, `Console errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('library status tabs survive rapid switching', async ({ page }) => {
    const errors = trackErrors(page);
    await page.getByText('Biblio', { exact: true }).click();

    const statuses = ['À lire', 'En cours', 'Lus', 'DNF'];
    for (let round = 0; round < 3; round++) {
      for (const s of statuses) {
        await page.getByText(s, { exact: false }).first().click();
        await page.waitForTimeout(60);
      }
    }

    await expect(page.getByPlaceholder('Chercher dans ma bibliothèque...').or(page.getByText("Touche une bibliothèque pour l'ouvrir"))).toBeVisible({ timeout: 10_000 });
    expect(errors, `Console errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('bursts of scroll direction changes leave the library toolbar in a consistent state', async ({ page }) => {
    const errors = trackErrors(page);
    await page.getByText('Biblio', { exact: true }).click();
    await page.getByLabel('Vue grille').click();

    const search = page.getByPlaceholder('Chercher dans ma bibliothèque...');
    await expect(search).toBeVisible();

    // Alternate direction on every burst — this is exactly the kind of
    // input the toolbar's scroll-direction spring (see app/(tabs)/library.tsx)
    // has to settle cleanly under, not get stuck mid-animation.
    for (let i = 0; i < 10; i++) {
      await scrollAt(page, 200, 400, i % 2 === 0 ? 500 : -500);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(600);

    // Whichever state it lands in, the toolbar must be fully one or the
    // other — not a half-collapsed limbo — so it's interactable again.
    const visible = await search.isVisible().catch(() => false);
    if (!visible) {
      for (let i = 0; i < 6; i++) {
        await scrollAt(page, 200, 400, -600);
        await page.waitForTimeout(80);
      }
      await expect(search).toBeVisible({ timeout: 5_000 });
    }
    expect(errors, `Console errors: ${errors.join('\n')}`).toEqual([]);
  });
});
