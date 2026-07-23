import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

const PORT = 8099;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // all specs share one Supabase test account/session
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 420, height: 900 }, // matches the app's phone-first layout
    // The whole suite asserts French copy. lib/i18n.ts resolves the app's
    // language from the device/browser locale (falling back to English for
    // anything unsupported) — Chromium's default `en-US` locale used to
    // accidentally match through to French before fallbackLng was changed
    // to 'en', so this pins it explicitly rather than relying on that.
    locale: 'fr-FR',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npx expo start --web --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
