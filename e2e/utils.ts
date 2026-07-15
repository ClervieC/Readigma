import { Page, expect } from '@playwright/test';

export const E2E_EMAIL = process.env.E2E_EMAIL!;
export const E2E_PASSWORD = process.env.E2E_PASSWORD!;

if (!E2E_EMAIL || !E2E_PASSWORD) {
  throw new Error('E2E_EMAIL / E2E_PASSWORD must be set (see .env.example) to run the e2e suite.');
}

// Logs in through the real UI (not a Supabase API shortcut) so every spec
// also exercises the login screen itself. Idempotent: a no-op if a session
// is already active (e.g. a previous test in the same worker left one).
export async function login(page: Page, email = E2E_EMAIL, password = E2E_PASSWORD) {
  await page.goto('/');
  const emailInput = page.getByPlaceholder('ton@email.com');
  if (await emailInput.count()) {
    await emailInput.fill(email);
    await page.getByPlaceholder('••••••••').fill(password);
    await page.getByText('Se connecter').click();
  }
  await dismissOnboardingIfPresent(page);
  // Land on a tab bar route before handing back to the caller. Playwright's
  // getByText does a case-insensitive substring match by default, and
  // "Découvrir" (the tab label) is also a substring of Discover's own
  // "Lance le tirage pour découvrir ton prochain livre" placeholder text —
  // exact: true is what actually disambiguates the two.
  await expect(page.getByText('Découvrir', { exact: true })).toBeVisible({ timeout: 15_000 });
}

// The onboarding carousel only shows once per account (server-side flag —
// see context/AuthContext.tsx's needsOnboarding) but the very first login
// of a freshly-created account, or a account that hasn't done it yet, still
// hits it.
export async function dismissOnboardingIfPresent(page: Page) {
  const skip = page.getByText('Passer').first();
  if (await skip.count().then(c => c > 0).catch(() => false)) {
    await skip.click();
  }
}

// RN Web's mouse wheel only scrolls whatever element is under the cursor —
// without moving there first, page.mouse.wheel() silently no-ops.
export async function scrollAt(page: Page, x: number, y: number, deltaY: number) {
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, deltaY);
}
