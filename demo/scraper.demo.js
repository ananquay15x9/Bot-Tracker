import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://goheels.com/sports/mens-basketball/schedule');
  await page.locator('#transcend-consent-manager').click();
});