import { test, expect, Page } from '@playwright/test';

test.describe('Reading Screen', () => {
  test('should navigate to the root and check for reading screen and no errors', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('div.reading-display')).toBeVisible();

    const errorToast = await page.locator('div[data-variant="destructive"]');
    await expect(errorToast).toHaveCount(0);
  });
});