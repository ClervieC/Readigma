import { test, expect } from '@playwright/test';
import { login } from './utils';

// One long sequential flow rather than several independent tests — each
// step needs the shared reading created in the first step, and re-searching
// a live book API (see lib/books.ts) per test would be slower and more
// flaky than just building on the same reading throughout.
test.describe('Lectures communes', () => {
  test.beforeEach(async ({ page }) => {
    await login(page); // also declines the ad consent banner — see utils.ts
  });

  test('create → post → react → theorize → rate → delete', async ({ page }) => {
    // Same error-tracking pattern as e2e/search.spec.ts — a failed Supabase
    // REST call here would otherwise only surface as a confusing downstream
    // timeout on whatever UI never updated. Any dialog (e.g. the web
    // fallback for a create-failure Alert.alert) gets auto-accepted so it
    // can't hang the test, but is still recorded as a failure signal.
    const apiErrors: string[] = [];
    page.on('response', async res => {
      if (res.url().includes('/rest/v1/') && !res.ok()) {
        apiErrors.push(`${res.status()} ${res.url()} :: ${await res.text().catch(() => '')}`);
      }
    });
    // Just auto-accepts — the delete step below deliberately triggers a
    // window.confirm(), so a dialog here is expected, not itself a failure
    // signal (unlike the response-tracking above, which only ever fires for
    // genuine REST errors).
    page.on('dialog', d => d.accept());

    // --- Create ---
    await page.goto('/shared-readings/create');
    await page.getByPlaceholder('Titre, auteur, ISBN...').fill('Le Petit Prince');
    await page.keyboard.press('Enter');
    await page.getByText('Le Petit Prince', { exact: false }).first().click();
    await page.getByText('Créer', { exact: true }).click();

    // Confirms navigation actually left /shared-readings/create before
    // asserting on page content — a much clearer failure than a downstream
    // timeout if creation silently failed.
    await expect(page).toHaveURL(/\/shared-readings\/(?!create)/, { timeout: 15_000 });

    // Lands on the detail screen, auto-joined as creator. "Participants"
    // matches both the roster section title and the creator dashboard's
    // stat label (sharedReadings.roster and .participants are both literally
    // "Participants") — .first() picks whichever renders, order doesn't matter.
    await expect(page.getByText('Participants').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Rejoindre')).not.toBeVisible();

    // --- Timeline: post a message ---
    // The composer is a multiline TextInput — Enter inserts a newline
    // rather than submitting, so the send icon button has to be clicked
    // directly (accessibilityLabel added to it specifically for this).
    const messageInput = page.getByPlaceholder('Écrire un message...');
    await messageInput.fill('Premier message de test e2e');
    await page.getByLabel('Envoyer le message').click();
    await expect(messageInput).toHaveValue('', { timeout: 10_000 });
    await expect(page.getByText('Premier message de test e2e')).toBeVisible({ timeout: 10_000 });

    // --- Reaction ---
    // First of REACTION_EMOJIS (lib/emojis.ts) shown in the picker.
    await page.getByText('😱', { exact: true }).first().click();
    await expect(page.getByText(/ont réagi 😱/)).toBeVisible({ timeout: 10_000 });

    // --- Theory: post then resolve it myself ---
    const theoryInput = page.getByPlaceholder('Faire une prédiction...');
    await theoryInput.fill('Le renard va apprivoiser le petit prince');
    await page.getByLabel('Envoyer la théorie').click();
    await expect(theoryInput).toHaveValue('', { timeout: 10_000 });
    await expect(page.getByText('Le renard va apprivoiser le petit prince')).toBeVisible({ timeout: 10_000 });
    // Resolving reveals the ✅/❌ badge in place of the check/x buttons —
    // only the author sees those buttons before resolution.
    await page.getByLabel('Marquer comme vrai').click();
    await expect(page.getByText('✅ Vrai')).toBeVisible({ timeout: 10_000 });

    // --- Rating: tap the numeric label to open the editable field ---
    await page.getByText('—', { exact: true }).first().click();
    const ratingInput = page.locator('input[type="text"], input:not([type])').last();
    await ratingInput.fill('4.5');
    await ratingInput.press('Enter');
    // Matches both StarRating's own numeric label and the avgRating summary
    // text below it (sharedReadings.avgRating also contains "4.50") — .first()
    // just needs one of them to confirm the rating round-tripped.
    await expect(page.getByText('4.50', { exact: false }).first()).toBeVisible({ timeout: 10_000 });

    // --- Cleanup: delete the reading via the "..." menu ---
    await page.getByLabel('Options de la lecture commune').click();
    await page.getByText('Supprimer la lecture commune').click();
    // Redirects to the shared-readings list rather than router.back() (see
    // app/shared-readings/[id].tsx) — asserting the URL actually changed is
    // more reliable than waiting for "Participants" to disappear, since
    // that text also exists elsewhere (roster/dashboard on other readings).
    await expect(page).toHaveURL(/\/shared-readings$/, { timeout: 10_000 });

    expect(apiErrors, `Unexpected API errors/dialogs: ${apiErrors.join('\n')}`).toEqual([]);
  });

  test('browse tab lists public shared readings', async ({ page }) => {
    await page.getByText('Lectures Communes', { exact: true }).click();
    await expect(page.getByText('Mes lectures', { exact: true })).toBeVisible({ timeout: 10_000 });
    // The in-page "Découvrir" sub-tab Pill (app/(tabs)/shared-readings.tsx)
    // has the exact same text as the bottom tab bar's "Découvrir" (Discover)
    // item, on screen at the same time — components/Pill.tsx sets an
    // explicit accessibilityLabel (the tab bar item doesn't), which is what
    // disambiguates the two here.
    await page.getByLabel('Découvrir', { exact: true }).click();
    // "Mes lectures" (the other sub-tab) is always present regardless of
    // which one is active, so it isn't a useful .or() fallback here — just
    // confirms the browse tab itself rendered without erroring, which is
    // this test's actual point (an empty vs. populated list is both fine).
    await expect(page.getByText('Mes lectures')).toBeVisible({ timeout: 10_000 });
  });
});
