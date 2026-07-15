import { test, expect } from '@playwright/test';
import { login } from './utils';

test.describe('Feed (Fil)', () => {
  test('loads without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', err => errors.push(err.message));

    await login(page);
    await page.getByText('Fil', { exact: true }).click();
    await expect(page.getByText('Activités de tes amis')).toBeVisible();
    await page.waitForTimeout(1500);

    expect(errors, `Console errors: ${errors.join('\n')}`).toEqual([]);
  });
});
