import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://www.capitalonearena.com/events');
  await page.getByRole('button', { name: 'Accept All' }).click();
  await page.getByRole('button', { name: 'Close Chat Popup' }).click();
  await page.getByText('Feb. 4, 2026 / 7:30 PM Georgetown vs. Creighton Event Starts 7:30 PM Buy').click();
});