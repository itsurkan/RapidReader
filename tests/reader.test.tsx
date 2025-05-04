import { test, expect, Page } from '@playwright/test';
import path from 'path';

test.describe('Reader', () => {
  test('should load the reader without errors and load an epub file', async ({ page }) => {
    await page.goto('/');

    const errorToasts = await page.locator('.toast[data-variant="destructive"]').all();
    expect(errorToasts.length).toBe(0);

    await page.evaluate(() => {
      const fileInputContainer = document.createElement('div');
      fileInputContainer.id = 'file-input';
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInputContainer.appendChild(fileInput);
      document.body.appendChild(fileInputContainer);
    });

    const filePath = path.join(__dirname, 'test-data', 'test.epub');
    const fileInput = page.locator('#file-input input[type="file"]');
    await fileInput.setInputFiles(filePath);

    await page.waitForTimeout(1000);

    const errorToastsAfterLoad = await page.locator('.toast[data-variant="destructive"]').all();
    expect(errorToastsAfterLoad.length).toBe(0);
  });
});