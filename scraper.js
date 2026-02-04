const { chromium } = require('playwright');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  const sites = [
    'https://www.capitalonearena.com/events',
    'https://www.enterprisecenter.com/events',
    'https://goheels.com/sports/mens-basketball/schedule'
  ];

  const allScrapedData = [];

  for (const url of sites) {
    await page.goto(url);
    
    if (url.includes('capitalonearena')) {
      // Run the Capital One logic
      console.log(`\nScraping Capital One Arena...`);
      
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

      for (const item of eventItems) {
        try {
          // Use '.innerText()' to get clean text without hidden SVG code
          const title = await item.locator('h3.title a').innerText();
          const dateAndTime = await item.locator('.date').innerText();

          // Clean up the text by removing extra line breaks and spaces
          const cleanTitle = title.trim().replace(/\s+/g, ' ');
          const cleanDate = dateAndTime.trim().replace(/\s+/g, ' ');

          console.log(`Successfully grabbed: ${cleanTitle}`); // Watch the terminal for this!

          allScrapedData.push({
            title: cleanTitle,
            date: cleanDate,
            source: 'Capital One Arena'
          });
        } catch (err) {
          // If one specific event has a weird structure, we don't want the whole bot to crash
          console.log("Skipping an event with missing info...");
        }
      }
    } 
    // ENTERPRISE CENTER WEBSITE!!!!!?
    else if (url.includes('enterprisecenter')) {
      console.log(`\nScraping Enterprise Center...`);

      // Wait for the main events list to be present
      await page.waitForSelector('#eventsList .event-entry', { timeout: 15000 });

      // Safely click "Load More" until either:
      // - the button disappears, OR
      // - clicking it no longer increases the number of event entries.
      try {
        while (true) {
          const loadMoreVisible = await page.isVisible('#loadMoreEvents');
          if (!loadMoreVisible) break;

          const beforeCount = await page.locator('#eventsList .event-entry').count();

          await page.locator('#loadMoreEvents').scrollIntoViewIfNeeded();
          await page.locator('#loadMoreEvents').click();
          console.log('Clicked "Load More" on Enterprise Center...');
          await page.waitForTimeout(2000);

          const afterCount = await page.locator('#eventsList .event-entry').count();
          if (afterCount <= beforeCount) {
            // No new events were added; avoid infinite loop.
            console.log('No new events after clicking "Load More"; stopping.');
            break;
          }
        }
      } catch (e) {
        console.log('Stopping Load More loop due to an error or page change.');
      }

      // Grab every "Info" link from the events list (after all load-mores)
      const infoLinks = await page.locator('#eventsList a.more').all();
      const urlsToVisit = [];

      for (const link of infoLinks) {
        const href = await link.getAttribute('href');
        if (href) {
          const fulUrl = href.startsWith('http') ? href: `https://www.enterprisecenter.com${href}`;
          urlsToVisit.push(fulUrl);
        }
      }

      //Filter unique URLs
      const uniqueUrls = [...new Set(urlsToVisit)];
      
      // Click to each detail info page and scrape data
      for (const detailUrl of uniqueUrls) {
        try {
          await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

          const eventTitle = await page.locator('h1').innerText(); 
          const showtimes = await page.locator('.showings_list li.entry').all();

          for (const show of showtimes) {
            allScrapedData.push({
              title: eventTitle.trim(),
              date: `${(await show.locator('.date').innerText()).trim()} ${(await show.locator('.time').innerText()).trim()}`,
              source: 'Enterprise Center'
            });
        }
        console.log(`Successfully deep-scraped: ${eventTitle.trim()}`);

      } catch (err) {
        console.log(`Error visiting detail page ${detailUrl}`);
      }
    }
  } else if (url.includes('goheels')) {
      // Run the Goheels logic
      console.log(`\nScraping Go Heels...`);
      
    }
  }

  //save it to csv file
  const csvWriter = createCsvWriter({
    path: 'events.csv',
    header: [
      {id: 'title', title: 'EVENT NAME'},
      {id: 'date', title: 'DATE AND TIME'},
      {id: 'source', title: 'SOURCE'}
    ]
  });

  await csvWriter.writeRecords(allScrapedData);
  console.log('\nDone! Check events.csv');

  await browser.close();
})();