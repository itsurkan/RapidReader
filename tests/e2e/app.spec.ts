import { test, expect } from '@playwright/test';
import path from 'path';

const testFileName = 'test.txt';
const testFilePath = path.join(__dirname, '..', 'test-data', testFileName);

test('should load a file and start reading', async ({ page }) => {
  await page.goto('/');

  // Verify initial state
  await expect(page.getByText('Upload a .txt or .epub file to begin.')).toBeVisible();
  const readingDisplay = page.locator('main > div[class*="text-4xl"]'); // More specific selector for reading display area
  await expect(readingDisplay).toBeVisible(); // Ensure the area exists

  // Locate the hidden file input and trigger upload
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(testFilePath);

  // Wait for file name to appear in controls (signifies loading attempt)
  await expect(page.locator(`[title="${testFileName}"]`)).toBeVisible({ timeout: 15000 }); // Increased timeout for potential epub parsing

  // Wait for the success toast message
  await expect(page.getByText('File Loaded')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(`${testFileName} is ready for reading.`)).toBeVisible({ timeout: 10000 });

  // Verify reading display now shows content (not the placeholder)
  // Wait for the initial text to disappear first
  await expect(page.getByText('Upload a .txt or .epub file to begin.')).not.toBeVisible({ timeout: 5000 });
  // Check if the reading display has text content. Get the first word.
  const firstWord = await readingDisplay.textContent();
  expect(firstWord).toBeTruthy(); // Ensure some text is displayed
  expect(firstWord?.trim()).not.toEqual('Upload a .txt or .epub file to begin.');
  console.log(`First word displayed: "${firstWord}"`);


  // Locate and click the play button
  const playButton = page.locator('button[aria-label="Start Reading"]');
  await playButton.click();

  // Wait for a short duration to allow reading to progress
  await page.waitForTimeout(1000); // Wait 1 second

  // Verify reading display has changed content (reading has progressed)
  const secondWordChunk = await readingDisplay.textContent();
  expect(secondWordChunk).toBeTruthy();
  expect(secondWordChunk).not.toEqual(firstWord); // Check that the content changed
  console.log(`Second word/chunk displayed: "${secondWordChunk}"`);

  // Verify the button is now a pause button
  await expect(page.locator('button[aria-label="Pause Reading"]')).toBeVisible();
});
