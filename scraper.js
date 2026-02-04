const { chromium } = require('playwright');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

function normalizeData(rawDate, rawTitle) {
  //Clean title
  const title = rawTitle.trim().replace(/\s+/g, ' ');

  //Clean date and time
  let cleanedText = rawDate.replace(/\([A-Za-z]+\)|[A-Za-z]+, /g, '').trim();
  cleanedText = cleanedText.replace(/\s+/g, ' ');

  //Split date and time
  let datePart = cleanedText;
  let timePart = "TBA";

  if (cleanedText.toLowerCase().includes('pm') || cleanedText.toLowerCase().includes('am')) {
    // Match time pattern like "7:30 PM" or "7 PM" or "7 p.m."
    const timeMatch = cleanedText.match(/(\d+(?::\d+)?\s*(?:pm|am|p\.m\.|a\.m\.))/i);
    if (timeMatch) {
      timePart = timeMatch[1].trim();
      datePart = cleanedText.substring(0, timeMatch.index).trim();
    }
  }

  return { title, date: datePart, time: timePart };
}


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
          const rawTitle = await item.locator('h3.title a').innerText();
          const dateAndTime = await item.locator('.date').innerText();

          // Clean up the text by removing extra line breaks and spaces
          const cleanTitle = rawTitle.trim().replace(/\s+/g, ' ');
          const cleanDate = dateAndTime.trim().replace(/\s+/g, ' ');

          console.log(`Successfully grabbed: ${cleanTitle}`); // Watch the terminal for this!

          const { title, date, time } = normalizeData(dateAndTime, cleanTitle);
          allScrapedData.push({
            title,
            date,
            time,
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

      // Wait for the main events list to be loaded
      await page.waitForSelector('#eventsList .event-entry', { timeout: 15000 });

      // Click load more until no more events
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
            // count and break if no new events loaded
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
            const rawDateAndTime = `${(await show.locator('.date').innerText()).trim()} ${(await show.locator('.time').innerText()).trim()}`;
            const { title, date, time } = normalizeData(rawDateAndTime, eventTitle.trim());
            allScrapedData.push({
              title,
              date,
              time,
              source: 'Enterprise Center'
            });
          }
          console.log(`Successfully grabbed: ${eventTitle.trim()}`);

        } catch (err) {
          console.log(`Error visiting detail page ${detailUrl}`);
        }
      }
  } else if (url.includes('goheels')) {
      console.log(`\nScraping Go Heels...`);
      //can't seem to close the cookie consent popup lol

      //scroll to the bottom to make sure all game cards are loaded
      try {
        await page.evaluate(async () => {
          await new Promise((resolve) => {
            let totalHeight = 0;
            let distance = 100;
            let timer = setInterval(() => {
              let scrollHeight = document.body.scrollHeight;
              window.scrollBy(0, distance);
              totalHeight += distance;
              if(totalHeight >= scrollHeight) {
                clearInterval(timer);
                resolve();
              }
            }, 100);
          });
        });
      } catch (e) {
        console.log('Scrolling failed (page may have navigated or closed), moving on to game card scraping if possible...');
      }

      //find all game card containers
      //every game is wrapped in a card
      const gameCards = await page.locator('.s-game-card__header-inner-top-inner').all();
      console.log(`Found ${gameCards.length} games!`);

      for (const card of gameCards) {
        try {
          const opponent = await card.locator('[data-test-id="s-game-card-standard__header-team-opponent-link"]').innerText();

          // try to find the date in the upcoming games section
          let dateText = '';
          const upcomingDate = card.locator('[data-test-id="s-game-card-standard__header-game-date"]');
          const pastDate = card.locator('[data-test-id="s-game-card-standard__header-game-date-details"]');

          if (await upcomingDate.count() > 0) {
            dateText = await upcomingDate.innerText();
          } else if (await pastDate.count() > 0) {
            dateText = await pastDate.innerText();
          }

          // get time and date
          const timeText = await card.locator('[data-test-id="s-game-card-standard__header-game-time"]').innerText();

          //Clean up
          const cleanTitle = `UNC Tar Heels vs ${opponent.trim()}`;
          const cleanDate = `${dateText.trim()} ${timeText.trim()}`.replace(/\s+/g, ' ');

          console.log(`Successfully grabbed: ${cleanTitle}`);

          const rawDateAndTime = `${dateText.trim()} ${timeText.trim()}`;
          const { title, date, time } = normalizeData(rawDateAndTime, `UNC Tar Heels vs ${opponent}`);
          allScrapedData.push({
            title,
            date,
            source: 'Go Heels'
          });
        } catch (err) {
          continue;
        }
      } 
    }
  }

  //save it to csv file
  const csvWriter = createCsvWriter({
    path: 'events.csv',
    header: [
      {id: 'title', title: 'EVENT NAME'},
      {id: 'date', title: 'DATE'},
      {id: 'time', title: 'TIME'},
      {id: 'source', title: 'SOURCE'}
    ]
  });

  await csvWriter.writeRecords(allScrapedData);
  console.log('\nDone! Check events.csv');

  await browser.close();
})();