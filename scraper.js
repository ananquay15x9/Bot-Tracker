const { chromium } = require('playwright');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto('https://www.capitalonearena.com/events');

  //Close popups
  try { await page.getByRole('button', { name: 'Accept All' }).click({timeout: 5000}); } catch(e) {}

  //Click "more events" until are all loaded
  while (await page.getByRole('button', { name: 'More Events' }).isVisible()) {
    await page.getByRole('button', { name: 'More Events' }).click();
    await page.waitForTimeout(1000);
  }

  //find all events containers
  const eventItems = await page.locator('.info.clearfix').all();
  console.log(`Found ${eventItems.length} events!`);

  const scrapedData = [];
  for (const item of eventItems) {
    try {
      // Use '.innerText()' to get clean text without hidden SVG code
      const title = await item.locator('h3.title a').innerText();
      const dateAndTime = await item.locator('.date').innerText();

      // Clean up the text by removing extra line breaks and spaces
      const cleanTitle = title.trim().replace(/\s+/g, ' ');
      const cleanDate = dateAndTime.trim().replace(/\s+/g, ' ');

      console.log(`Successfully grabbed: ${cleanTitle}`); // Watch the terminal for this!

      scrapedData.push({
        title: cleanTitle,
        date: cleanDate
      });
    } catch (err) {
      // If one specific event has a weird structure, we don't want the whole bot to crash
      console.log("Skipping an event with missing info...");
    }
  }

  //save it to csv file
  const csvWriter = createCsvWriter({
    path: 'events.csv',
    header: [
      {id: 'title', title: 'EVENT NAME'},
      {id: 'date', title: 'DATE AND TIME'}
    ]
  });

  await csvWriter.writeRecords(scrapedData);
  console.log('Done! Check events.csv');

  await browser.close();
})();