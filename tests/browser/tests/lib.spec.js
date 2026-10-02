import { test, expect } from '@playwright/test';

async function waitForMochaAndAssertResult(page) {
  await page.waitForFunction(() => window.mochaResults); // eslint-disable-line no-undef
  const mochaResults = await page.evaluate('window.mochaResults');

  expect(mochaResults.failures).toBe(0);
}

test('Spec handlebars.js', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/spec/?headless=true`);
  await waitForMochaAndAssertResult(page);
});
