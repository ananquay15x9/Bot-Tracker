import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://www.enterprisecenter.com/events');
  await page.getByRole('button', { name: 'Load More' }).click();
  await page.locator('div:nth-child(12) > .info > .info-hidden > .button-container > .more').first().click();
  await page.getByRole('button', { name: 'Load More' }).click();
  await page.locator('.current_events > div:nth-child(12) > .info > .info-hidden > .button-container > .more').click();
  await page.getByRole('button', { name: 'Load More' }).click();
  await page.locator('.event_list').click();
  await page.getByRole('button', { name: 'Load More' }).click();
  await page.locator('div:nth-child(14) > .event-entry.entry.alt > .info > .info-hidden > .button-container > .more').click();
  await page.locator('div:nth-child(14) > .event-entry.entry.alt > .info > .info-hidden > .button-container > .more').click();
  await page.getByRole('button', { name: 'Load More' }).click();
  await page.getByRole('button', { name: 'Load More' }).click();
});