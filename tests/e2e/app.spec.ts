import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';

const testTxtFileName = 'test.txt';
const testTxtFilePath = path.join(__dirname, '..', 'test-data', testTxtFileName);

const testEpubFileName = 'test.epub';
const testEpubDirPath = path.join(__dirname, '..', 'test-data', 'test.epub.dir');
const testEpubFilePath = path.join(__dirname, '..', 'test-data', testEpubFileName);

// Function to zip the directory before tests run
const createEpubZip = () => {
  try {
    if (fs.existsSync(testEpubFilePath)) {
      fs.unlinkSync(testEpubFilePath); // Delete existing zip if present
    }
    const zip = new AdmZip();
    zip.addLocalFolder(testEpubDirPath);
    zip.writeZip(testEpubFilePath);
    console.log(`Successfully created ${testEpubFileName}`);
  } catch (error) {
    console.error(`Error creating EPUB zip file: ${error}`);
    throw error; // Re-throw to fail the test setup if zipping fails
  }
};

// Create the EPUB zip file before running tests
test.beforeAll(() => {
  createEpubZip();
});

test('should load a TXT file and start reading', async ({ page }) => {
  await page.goto('/');

  // Verify initial state
  await expect(page.getByText('Upload a .txt or .epub file to begin.')).toBeVisible();
  const readingDisplay = page.locator('main > div[class*="text-4xl"]');
  await expect(readingDisplay).toBeVisible();

  // Locate the hidden file input and trigger TXT upload
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(testTxtFilePath);

  // Wait for file name to appear in controls
  await expect(page.locator(`[title="${testTxtFileName}"]`)).toBeVisible({ timeout: 15000 });

  // Wait for the success toast message
  await expect(page.getByText('File Loaded')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(`${testTxtFileName} is ready for reading.`)).toBeVisible({ timeout: 10000 });

  // Verify reading display shows content
  await expect(page.getByText('Upload a .txt or .epub file to begin.')).not.toBeVisible({ timeout: 5000 });
  const firstWordTxt = await readingDisplay.textContent();
  expect(firstWordTxt).toBeTruthy();
  expect(firstWordTxt?.trim()).not.toEqual('Upload a .txt or .epub file to begin.');
  console.log(`TXT - First chunk displayed: "${firstWordTxt}"`);

  // Locate and click the play button
  const playButtonTxt = page.locator('button[aria-label="Start Reading"]');
  await playButtonTxt.click();

  // Wait for reading to progress
  await page.waitForTimeout(1000);

  // Verify reading display has changed content
  const secondWordChunkTxt = await readingDisplay.textContent();
  expect(secondWordChunkTxt).toBeTruthy();
  expect(secondWordChunkTxt).not.toEqual(firstWordTxt);
  console.log(`TXT - Second chunk displayed: "${secondWordChunkTxt}"`);

  // Verify the button is now a pause button
  await expect(page.locator('button[aria-label="Pause Reading"]')).toBeVisible();

  // Pause reading for the next test
  await page.locator('button[aria-label="Pause Reading"]').click();
});


test('should load an EPUB file and start reading', async ({ page }) => {
  await page.goto('/'); // Go to the page or ensure it's reset

  // Verify initial state again (optional, but good practice)
  await expect(page.getByText('Upload a .txt or .epub file to begin.')).toBeVisible();
  const readingDisplay = page.locator('main > div[class*="text-4xl"]');
  await expect(readingDisplay).toBeVisible();

  // Locate the hidden file input and trigger EPUB upload
  const fileInput = page.locator('input[type="file"]');
  if (!fs.existsSync(testEpubFilePath)) {
     throw new Error(`EPUB test file not found at: ${testEpubFilePath}`);
  }
  await fileInput.setInputFiles(testEpubFilePath);

  // Wait for file name to appear in controls
  await expect(page.locator(`[title="${testEpubFileName}"]`)).toBeVisible({ timeout: 20000 }); // Increased timeout for epub parsing

  // Wait for the success toast message (adjust text if needed)
  await expect(page.getByText('File Loaded')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(`${testEpubFileName} is ready for reading.`)).toBeVisible({ timeout: 15000 });

  // Verify reading display shows content
  await expect(page.getByText('Upload a .txt or .epub file to begin.')).not.toBeVisible({ timeout: 10000 }); // Increased timeout
  const firstWordEpub = await readingDisplay.textContent();
  expect(firstWordEpub).toBeTruthy();
  expect(firstWordEpub?.trim()).not.toEqual('Upload a .txt or .epub file to begin.');
  expect(firstWordEpub?.trim().toLowerCase()).toContain('this is the'); // Check for expected content start
  console.log(`EPUB - First chunk displayed: "${firstWordEpub}"`);

  // Locate and click the play button
  const playButtonEpub = page.locator('button[aria-label="Start Reading"]');
  await playButtonEpub.click();

  // Wait for reading to progress
  await page.waitForTimeout(1000); // Adjust time if needed based on WPM/chunk size

  // Verify reading display has changed content
  const secondWordChunkEpub = await readingDisplay.textContent();
  expect(secondWordChunkEpub).toBeTruthy();
  expect(secondWordChunkEpub).not.toEqual(firstWordEpub);
  console.log(`EPUB - Second chunk displayed: "${secondWordChunkEpub}"`);

  // Verify the button is now a pause button
  await expect(page.locator('button[aria-label="Pause Reading"]')).toBeVisible();
});

// Cleanup zip file after tests
test.afterAll(() => {
  try {
    if (fs.existsSync(testEpubFilePath)) {
      fs.unlinkSync(testEpubFilePath);
      console.log(`Cleaned up ${testEpubFileName}`);
    }
  } catch (error) {
    console.error(`Error cleaning up EPUB zip file: ${error}`);
  }
});
