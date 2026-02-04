const { chromium } = require('playwright');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// Convert date to yyyy-mm-dd format
function formatDate(dateStr) {
  // Handle "TBA" or date ranges
  if (!dateStr || dateStr === 'TBA' || dateStr.includes('-')) {
    return dateStr;
  }

  // Remove trailing comma and extra spaces
  dateStr = dateStr.replace(/,\s*$/, '').trim();

  // Parse different date formats
  // Format 1: "FEB. 4, 2026 /" -> 2026-02-04
  // Format 2: "Feb 5, 2026" -> 2026-02-05
  // Format 3: "Feb 7" -> 2026-02-07 (assume current year 2026)

  const monthMap = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
    'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
  };

  // Remove slashes and extra punctuation
  dateStr = dateStr.replace(/\//g, '').trim();

  // Match pattern: Month Day Year or Month Day
  const match = dateStr.match(/([A-Za-z]+)\.?\s+(\d+)(?:\s+(\d{4}))?/);
  if (match) {
    const month = monthMap[match[1].toLowerCase().substring(0, 3)];
    const day = match[2].padStart(2, '0');
    const year = match[3] || '2026';

    if (month) {
      return `${year}-${month}-${day}`;
    }
  }

  return dateStr;
}

// Get academic year based on current date
// Academic year runs from August to July (e.g., 2025-2026 academic year)
function getAcademicYear() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentYear = now.getFullYear();
  
  // If current month is Aug-Dec, academic year is currentYear to currentYear+1
  // If current month is Jan-Jul, academic year is currentYear-1 to currentYear
  if (currentMonth >= 8) {
    return { firstHalf: currentYear, secondHalf: currentYear + 1 };
  } else {
    return { firstHalf: currentYear - 1, secondHalf: currentYear };
  }
}

// Determine which year a month falls into based on academic calendar
function getYearForMonth(monthStr) {
  const academicYear = getAcademicYear();
  // Oct, Nov, Dec are in the first half of academic year
  // Jan-Sep are in the second half
  if (monthStr === 'oct' || monthStr === 'nov' || monthStr === 'dec') {
    return academicYear.firstHalf;
  } else {
    return academicYear.secondHalf;
  }
}

// Format time to 12:00AM or 12:00PM (no space)
function formatTime(timeStr) {
  if (!timeStr || timeStr === 'TBA') {
    return timeStr;
  }

  // Remove spaces between time and AM/PM
  timeStr = timeStr.replace(/\s*(AM|PM|am|pm)/i, (match, ampm) => ampm.toUpperCase());

  // Ensure minutes are included (add :00 if missing)
  if (/^\d+(?:AM|PM)$/i.test(timeStr)) {
    timeStr = timeStr.replace(/(\d+)(AM|PM)/i, '$1:00$2');
  }

  return timeStr;
}

// Expand date ranges into individual dates
function expandDateRange(dateStr, isGoHeels = false) {
  const monthMap = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4,
    'may': 5, 'jun': 6, 'jul': 7, 'aug': 8,
    'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
  };

  // Pattern 1: "FEB. 13 - 14, 2026" or "OCT. 25 - 27, 2026"
  const pattern1 = dateStr.match(/([A-Z]+)\.?\s+(\d+)\s*-\s*(\d+),?\s*(\d{4})/i);
  if (pattern1) {
    const monthStr = pattern1[1].toLowerCase().substring(0, 3);
    const monthNum = monthMap[monthStr];
    const startDay = parseInt(pattern1[2]);
    const endDay = parseInt(pattern1[3]);
    const year = pattern1[4];

    const dates = [];
    for (let day = startDay; day <= endDay; day++) {
      dates.push(`${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }
    return dates;
  }

  // Pattern 2: "Mar 10 - Mar 14 TBA" (Go Heels format)
  const pattern2 = dateStr.match(/([A-Z]+)\.?\s+(\d+)\s*-\s*([A-Z]+)\.?\s+(\d+)/i);
  if (pattern2) {
    const startMonthStr = pattern2[1].toLowerCase().substring(0, 3);
    const startDay = parseInt(pattern2[2]);
    const endMonthStr = pattern2[3].toLowerCase().substring(0, 3);
    const endDay = parseInt(pattern2[4]);

    const startMonth = monthMap[startMonthStr];
    const endMonth = monthMap[endMonthStr];

    // Determine year based on month (for Go Heels academic year logic)
    let startYear = isGoHeels ? getYearForMonth(startMonthStr) : new Date().getFullYear();
    let endYear = isGoHeels ? getYearForMonth(endMonthStr) : new Date().getFullYear();

    const dates = [];

    if (startMonth === endMonth) {
      // Same month
      for (let day = startDay; day <= endDay; day++) {
        dates.push(`${startYear}-${String(startMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
      }
    } else {
      // Different months - add all days from start month
      const daysInStartMonth = new Date(startYear, startMonth, 0).getDate();
      for (let day = startDay; day <= daysInStartMonth; day++) {
        dates.push(`${startYear}-${String(startMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
      }
      // Add all days until end day in end month
      for (let day = 1; day <= endDay; day++) {
        dates.push(`${endYear}-${String(endMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
      }
    }
    return dates;
  }

  // No range detected, return single date
  return [dateStr];
}

// Special date formatter for Go Heels (handles 2025-2026 academic year)
function formatGoHeelsDate(dateStr) {
  if (!dateStr || dateStr === 'TBA') {
    return dateStr;
  }

  // Clean up the messy formatting: remove newlines, day-of-week in parentheses, extra spaces
  dateStr = dateStr.replace(/\n/g, ' ').replace(/\([A-Za-z]+\)/g, '').replace(/\s+/g, ' ').trim();

  // Remove duplicate date patterns like "Oct 4 Oct 4"
  dateStr = dateStr.replace(/(\b[A-Za-z]{3}\s+\d+)\s+\1/g, '$1');

  // Remove trailing comma
  dateStr = dateStr.replace(/,\s*$/, '').trim();

  const monthMap = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
    'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
  };

  // Check if it's a date range (contains " - " or "TBA" after a dash)
  if (dateStr.includes(' - ') || /\d+\s*-/.test(dateStr)) {
    return dateStr; // Keep date ranges as-is
  }

  // Match pattern: Month Day
  const match = dateStr.match(/([A-Za-z]+)\.?\s+(\d+)/);
  if (match) {
    const monthStr = match[1].toLowerCase().substring(0, 3);
    const month = monthMap[monthStr];
    const day = match[2].padStart(2, '0');

    // Determine year dynamically based on academic calendar
    const year = getYearForMonth(monthStr);

    if (month) {
      return `${year}-${month}-${day}`;
    }
  }

  return dateStr;
}

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
      // Convert "p.m." to "PM" and "a.m." to "AM"
      timePart = timePart.replace(/p\.m\./i, 'PM').replace(/a\.m\./i, 'AM');
      timePart = timePart.replace(/\s*pm/i, ' PM').replace(/\s*am/i, ' AM');
      timePart = timePart.trim();

      datePart = cleanedText.substring(0, timeMatch.index).trim();
      // Add comma after date part for consistency
      if (datePart && !datePart.endsWith(',')) {
        datePart = datePart + ',';
      }
    }
  }

  return { title, date: datePart, time: timePart };
}

//try DOM removal of cookie popup
async function setupTranscendKiller(page) {
  //remove on creation
  await page.addInitScript(() => {
    const kill = () => {
      const host = document.querySelector('#transcend-consent-manager');
      if (host) host.remove();

      //unlock scroll
      document.documentElement.style.overflow = 'auto';
      document.body.style.overflow = 'auto';
      document.body.style.position = 'static';
    };

    kill();

    const obs = new MutationObserver(() => kill());
    obs.observe(document.documentElement, { childList: true, subtree: true });
  });

  //block it
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (
      u.includes('transcend-cdn.com/cm/') ||
      u.includes('transcend.io') ||
      u.includes('/consent') && u.includes('transcend')
    ) {
      return route.abort();
    }
    return route.continue();
  });
}

// DONE TO MAIN FUNCTION

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  const sites = [
    'https://www.capitalonearena.com/events',
    'https://www.enterprisecenter.com/events',
    'https://goheels.com/sports/mens-basketball/schedule'
  ];

  const allScrapedData = [];

  //setup killer
  let transcendSetupDone = false;

  for (const url of sites) {
    if (url.includes('goheels') && !transcendSetupDone) {
      await setupTranscendKiller(page);
      transcendSetupDone = true;
    }

    await page.goto(url, { waitUntil: 'domcontentloaded' });

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
          const formattedDate = formatDate(date);
          const dates = expandDateRange(formattedDate);

          // Add a row for each date in the range
          for (const singleDate of dates) {
            allScrapedData.push({
              venue: 'Capital One Arena',
              title,
              date: singleDate,
              time: formatTime(time)
            });
          }
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
            const formattedDate = formatDate(date);
            const dates = expandDateRange(formattedDate);

            // Add a row for each date in the range
            for (const singleDate of dates) {
              allScrapedData.push({
                venue: 'Enterprise Center',
                title,
                date: singleDate,
                time: formatTime(time)
              });
            }
          }
          console.log(`Successfully grabbed: ${eventTitle.trim()}`);

        } catch (err) {
          console.log(`Error visiting detail page ${detailUrl}`);
        }
      }
  } else if (url.includes('goheels')) {
      console.log(`\nScraping Go Heels...`);
      //can't seem to close the cookie consent popup lol
      await page.evaluate(()=> {
        const host = document.querySelector('#transcend-consent-manager');
        if (host) host.remove();

        document.documentElement.style.overflow = 'auto';
        document.body.style.overflow = 'auto';
        document.body.style.position = 'static';
      });

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

          // Parse date and time
          const rawDateAndTime = `${dateText.trim()} ${timeText.trim()}`;
          let finalDate = rawDateAndTime;
          let finalTime = 'TBA';

          // Check if there's a time in the format (e.g., "6:30 p.m." or "7 p.m.")
          const timeMatch = rawDateAndTime.match(/(\d+(?::\d+)?\s*(?:p\.m\.|a\.m\.))/i);
          if (timeMatch) {
            // Extract time and convert to uppercase PM/AM
            finalTime = timeMatch[1].trim()
              .replace(/p\.m\./i, 'PM')
              .replace(/a\.m\./i, 'AM')
              .replace(/\s+/g, ' ')
              .trim();

            
            finalDate = rawDateAndTime.substring(0, timeMatch.index).trim();
            if (finalDate && !finalDate.endsWith(',')) {
              finalDate = finalDate + ',';
            }
          }

          const formattedDate = formatGoHeelsDate(finalDate);
          const dates = expandDateRange(formattedDate, true);

          // Add a row for each date in the range
          for (const singleDate of dates) {
            allScrapedData.push({
              venue: 'Go Heels',
              title: cleanTitle,
              date: singleDate,
              time: formatTime(finalTime)
            });
          }
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
      {id: 'venue', title: 'VENUE'},
      {id: 'title', title: 'EVENT NAME'},
      {id: 'date', title: 'DATE'},
      {id: 'time', title: 'TIME'}
    ]
  });

  await csvWriter.writeRecords(allScrapedData);
  console.log('\nDone! Check events.csv');

  await browser.close();
})();