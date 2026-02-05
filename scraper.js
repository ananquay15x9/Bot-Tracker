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

  // change date format
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

  // format go heels
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

  // return single date
  return [dateStr];
}

//  (handles 2025-2026 academic year)
function formatGoHeelsDate(dateStr) {
  if (!dateStr || dateStr === 'TBA') {
    return dateStr;
  }

  // clean up the date string
  dateStr = dateStr.replace(/\n/g, ' ').replace(/\([A-Za-z]+\)/g, '').replace(/\s+/g, ' ').trim();

  // remove duplicate date
  dateStr = dateStr.replace(/(\b[A-Za-z]{3}\s+\d+)\s+\1/g, '$1');

  // remove trailing comma
  dateStr = dateStr.replace(/,\s*$/, '').trim();

  const monthMap = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
    'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
  };

  // check if it's a date range (contains " - " or "TBA" after a dash)
  if (dateStr.includes(' - ') || /\d+\s*-/.test(dateStr)) {
    return dateStr; // Keep date ranges as-is
  }

  // match pattern
  const match = dateStr.match(/([A-Za-z]+)\.?\s+(\d+)/);
  if (match) {
    const monthStr = match[1].toLowerCase().substring(0, 3);
    const month = monthMap[monthStr];
    const day = match[2].padStart(2, '0');

    // determine year dynamically based on academic calendar
    const year = getYearForMonth(monthStr);

    if (month) {
      return `${year}-${month}-${day}`;
    }
  }

  return dateStr;
}

function normalizeData(rawDate, rawTitle) {
  //clean title
  const title = rawTitle.trim().replace(/\s+/g, ' ');

  //clean date and time
  let cleanedText = rawDate.replace(/\([A-Za-z]+\)|[A-Za-z]+, /g, '').trim();
  cleanedText = cleanedText.replace(/\s+/g, ' ');

  //split date and time
  let datePart = cleanedText;
  let timePart = "TBA";

  if (cleanedText.toLowerCase().includes('pm') || cleanedText.toLowerCase().includes('am')) {
    // match time pattern like "7:30 PM" or "7 PM" or "7 p.m."
    const timeMatch = cleanedText.match(/(\d+(?::\d+)?\s*(?:pm|am|p\.m\.|a\.m\.))/i);
    if (timeMatch) {
      timePart = timeMatch[1].trim();
      // convert "p.m." to "PM" and "a.m." to "AM"
      timePart = timePart.replace(/p\.m\./i, 'PM').replace(/a\.m\./i, 'AM');
      timePart = timePart.replace(/\s*pm/i, ' PM').replace(/\s*am/i, ' AM');
      timePart = timePart.trim();

      datePart = cleanedText.substring(0, timeMatch.index).trim();
      // add comma after date part for consistency
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

//========================================
// SORTING TYPE FUNCTION

// --- CAPITAL ONE TYPE
function categorizeCapitalOne(title, description) {
    const titleLower = title.toLowerCase();
    const descLower = (description || "").toLowerCase();
    const fullText = (titleLower + " " + descLower);

    // 1. nba/nhl/ncaa (keep these high priority)
    if (fullText.includes('wizards') || fullText.includes('nba')) return 'NBA';
    if (fullText.includes('capitals') || fullText.includes('nhl')) return 'NHL';

    //ncaa mb
    const collegeTeams = ['georgetown', 'hoyas', 'creighton', 'villanova', 'marquette', 'providence', 'xavier', 'uconn'];
    const isCollegeGame = collegeTeams.some(team => titleLower.includes(team)) || fullText.includes('men\'s basketball');

    if (isCollegeGame) return 'NCAA MB';

    // wnba
    if (titleLower.includes('mystics') || titleLower.includes('wnba')) return 'WNBA';

    // 2. the concert "catch-all"
    // added 'jyp', 'female', and 'celebrated' based on your TWICE snippet
    const musicKeywords = [
        'k-pop', 'jyp', 'tour', 'album', 'stadium', 'performance',
        'hits', 'billboard', 'artist', 'live', 'music', 'singer',
        'band', 'grammy', 'female group', 'celebrated', 'concert'
    ];

    if (musicKeywords.some(kw => fullText.includes(kw))) {
        return 'Concert';
    }

    return 'Other';
}

// --- ENTERPRISE CENTER TYPE
function categorizeEnterprise(title, description) {
    const titleLower = title.toLowerCase();
    const descLower = (description || "").toLowerCase();
    const fullText = (title + " " + description).toLowerCase();

    // NHL
    if (titleLower.includes('blues') || titleLower.includes('nhl')) {
        return 'NHL';
    }

    // NCAA MB
    if (titleLower.includes('billikens') || titleLower.includes('slu') ||
        titleLower.includes('ncaa') || titleLower.includes('basketball tournament') ||
        titleLower.includes('missouri valley')) return 'NCAA MB';

    // Other
    const familyKeywords = [
      'disney', 'pixar', 'children', 'family', 'mickey', 'frozen', 'marvel'
    ];
      if (familyKeywords.some(kw => fullText.includes(kw))) {
        return 'Other';
    }

    // Concert
    const musicKeywords = [
        'tour', 'album', 'concert', 'live', 'band', 'orchestra', 'symphony',
        'debut', 'grammy', 'special guest', 'performance', 'music', 'festival',
        'performing', 'show', 'comedian', 'comedy', 'live'
    ];
    const isFamilyShow = fullText.includes('disney') || fullText.includes('pixar') || fullText.includes('children') || fullText.includes('family') || fullText.includes('mickey');

    if (musicKeywords.some(kw => fullText.includes(kw))) {
        return 'Concert';
    }

    return 'Other';
}

// --- GO HEELS TYPE
function categorizeGoHeels(title) {
    const titleLower = title.toLowerCase();

    //NCAA MB - UNC basketball games and ACC Tournament
    if (titleLower.includes('unc vs') ||
        titleLower.includes('tar heels') ||
        titleLower.includes('acc tournament') ||
        titleLower.includes('tournament') ||
        titleLower.includes('scrimmage')) {
        return 'NCAA MB';
    }

    //CONCERT - only actual concerts (not tournaments with "tour" in them)
    const musicKeywords = ['concert', 'live music', 'band', 'singer', 'artist'];
    if (musicKeywords.some(kw => titleLower.includes(kw))) {
        return 'Concert';
    }

    //Other
    return 'Other';
}

// --- GRAND CASINO ARENA TYPE
function assignType(title, description) {
    const titleLower = title.toLowerCase();
    const fullText = (title + " " + description).toLowerCase();

    // 1. Identify NHL - Look for 'vs.' primarily in the TITLE, not the description
    const nhlMarkers = ['nhl', 'wild', 'blues', 'capitals', 'blackhawks'];
    const isVersusMatch = titleLower.includes(' vs ') || titleLower.includes(' vs. ');

    if ((nhlMarkers.some(m => fullText.includes(m)) || isVersusMatch) && !fullText.includes('pwhl')) {
        return 'NHL';
    }

    // 2. Identify PWHL
    if (fullText.includes('pwhl') || (fullText.includes('women') && fullText.includes('hockey'))) {
        return 'PWHL';
    }

    // 3. Identify Concerts
    const musicMarkers = ['tour', 'album', 'grammy', 'live', 'artist', 'concert', 'special guest', 'debut'];
    if (musicMarkers.some(m => fullText.includes(m))) {
        return 'Concert';
    }

    return 'Other';
}

//---KFC TYPE
function categorizeKFC(title, description) {
    const titleLower = title.toLowerCase();
    const descLower = (description || "").toLowerCase();
    const fullText = (titleLower + " " + descLower);

    // 1. NCAA MB (Men's Basketball)
    if (fullText.includes("men's basketball") || (titleLower.includes('louisville') && titleLower.includes('basketball') && !titleLower.includes('women'))) {
        return 'NCAA MB';
    }

    // 2. NCAA WB (Women's Basketball)
    if (fullText.includes("women's basketball") || titleLower.includes('women\'s basketball')) {
        return 'NCAA WB';
    }

    // 3. NCAA WVB (Women's Volleyball)
    if (fullText.includes("volleyball") || titleLower.includes('volleyball')) {
        return 'NCAA WVB';
    }

    // 4. CONCERT
    const musicKeywords = ['tour', 'album', 'concert', 'live', 'artist', 'band', 'grammy', 'performing', 'music'];
    if (musicKeywords.some(kw => fullText.includes(kw))) {
        return 'Concert';
    }

    // 5. OTHER
    const otherKeywords = ['disney', 'mickey', 'family', 'kids', 'children', 'expo', 'festival'];
    if (otherKeywords.some(kw => fullText.includes(kw)) || !musicKeywords.some(kw => fullText.includes(kw))) {
        return 'Other';
    }
    
}

// =======================================


// =======================================================================================================================
// DONE TO MAIN FUNCTION

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  const sites = [
    'https://www.capitalonearena.com/events',
    'https://www.enterprisecenter.com/events',
    'https://goheels.com/sports/mens-basketball/schedule',
    'https://www.grandcasinoarena.com/events',
    'https://www.kfcyumcenter.com/events'
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

      //close popups
      try { await page.getByRole('button', { name: 'Accept All' }).click({timeout: 5000}); } catch(e) {}

      //click "more events" until are all loaded
      while (await page.getByRole('button', { name: 'More Events' }).isVisible()) {
        await page.getByRole('button', { name: 'More Events' }).click();
        await page.waitForTimeout(1000);
      }

  // 1. First, collect all the event URLs from the main list
  const eventItems = await page.locator('.info.clearfix').all();
  const eventsToScrape = [];

  for (const item of eventItems) {
    const titleLocator = item.locator('h3.title a');
    const url = await titleLocator.getAttribute('href');
    const rawTitle = await titleLocator.innerText();
    const dateText = await item.locator('.date').innerText();

    eventsToScrape.push({
      url: url.startsWith('http') ? url : `https://www.capitalonearena.com${url}`,
      rawTitle,
      dateText
    });
  }

  console.log(`Collected ${eventsToScrape.length} event links. Starting deep scrape...`);

  // 2. Now, visit each detail page one by one
  for (const event of eventsToScrape) {
    try {
      await page.goto(event.url, { waitUntil: 'domcontentloaded' });

      // Grabbing the description from the detail page
      // using textContent to be safe
      let eventDescription = "";
      const descLocator = page.locator('.description_inner');
      if (await descLocator.count() > 0) {
        eventDescription = await descLocator.textContent();
      }

      // 3. categorize using the full description
      const cleanTitle = event.rawTitle.trim().replace(/\s+/g, ' ');
      const eventType = categorizeCapitalOne(cleanTitle, eventDescription);

      console.log(`Pulling: ${cleanTitle} as ${eventType}`);

      // 4. normalize & push (using your existing logic)
      const { title, date, time } = normalizeData(event.dateText, cleanTitle);
      const formattedDate = formatDate(date);
      const dates = expandDateRange(formattedDate);

      for (const singleDate of dates) {
        allScrapedData.push({
          venue: 'Capital One Arena',
          title,
          date: singleDate,
          time: formatTime(time),
          type: eventType
        });
      }
    } catch (err) {
      console.log(`Error on page ${event.url}: ${err.message}`);
    }
  }

    // ENTERPRISE CENTER WEBSITE!!!!!?
    } else if (url.includes('enterprisecenter')) {
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

          // 1. Grab the Title first (Need this for categorization)
          const eventTitle = await page.locator('h1').innerText();

          // 2. Click "Continue Reading" to expand the description

          let eventDescription = "";
          const descLocator = page.locator('.collapse-wrapper');

          // count() check is instant—it doesn't wait 30 seconds!
          if (await descLocator.count() > 0) {
              try {
                const readMoreBtn = page.locator('span.readmore');
                if (await readMoreBtn.isVisible()) {
                  await readMoreBtn.click();
                  await page.waitForTimeout(300);
                }
                // get the text since we know the locator exists
                eventDescription = await descLocator.textContent();
              } catch (e) {
                console.log("Description exists but couldn't be expanded/read.");
              }
          } else {
              console.log(`No description box found for: ${eventTitle.trim()} - skipping description.`);
          }

          // 4. Categorize
          const eventType = categorizeEnterprise(eventTitle, eventDescription);
          console.log(`Successfully categorized: ${eventTitle.trim()} as ${eventType}`);

          // 5. Process showtimes
          const showtimes = await page.locator('.showings_list li.entry').all();

          for (const show of showtimes) {
            const dateText = await show.locator('.date').innerText();
            const timeText = await show.locator('.time').innerText();
            const rawDateAndTime = `${dateText.trim()} ${timeText.trim()}`;

            const { title, date, time } = normalizeData(rawDateAndTime, eventTitle.trim());
            const formattedDate = formatDate(date);
            const dates = expandDateRange(formattedDate);

            // Add a row for each date in the range
            for (const singleDate of dates) {
              allScrapedData.push({
                venue: 'Enterprise Center',
                title,
                date: singleDate,
                time: formatTime(time),
                type: eventType
              });
            }
          }
          console.log(`Successfully grabbed: ${eventTitle.trim()}`);

        } catch (err) {
          console.log(`Error visiting detail page ${detailUrl}: ${err.message}`);
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
            const cleanTitle = `UNC vs ${opponent.trim()}`;
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

            const eventType = categorizeGoHeels(cleanTitle);

            const formattedDate = formatGoHeelsDate(finalDate);
            const dates = expandDateRange(formattedDate, true);

            // Add a row for each date in the range
            for (const singleDate of dates) {
              allScrapedData.push({
                venue: 'Go Heels',
                title: cleanTitle,
                date: singleDate,
                time: formatTime(finalTime),
                type: eventType
              });
            }
          } catch (err) {
            continue;
        }
      }
    } else if (url.includes('grandcasinoarena')) {
      console.log(`\nScraping Grand Casino Arena...`);

      // expand the list fully
      try {
        const loadMoreBtn = page.locator('#loadMoreEvents');
        while (await loadMoreBtn.isVisible() && await loadMoreBtn.isEnabled()) {
            await loadMoreBtn.scrollIntoViewIfNeeded();
            await loadMoreBtn.click();
            await page.waitForTimeout(1500);
            if (await loadMoreBtn.getAttribute('disabled') === 'disabled') break;
        }
      } catch (e) { console.log('List expanded.'); }

      const infoLinks = await page.locator('a.more').all();
      const uniqueUrls = [...new Set(await Promise.all(infoLinks.map(link => link.getAttribute('href'))))];

      for (const detailUrl of uniqueUrls) {
        try {
          const fullUrl = detailUrl.startsWith('http') ? detailUrl : `https://www.grandcasinoarena.com${detailUrl}`;
          await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

          // get the title
          const rawTitle = await page.locator('h1.title').first().innerText();
          const cleanTitle = rawTitle.trim().replace(/\s+/g, ' ');

          // check tyope
          let eventType = 'Other';
          let eventDescription = "";
          if (cleanTitle.toLowerCase().includes('wild') || cleanTitle.toLowerCase().includes('vs.')) {
              eventType = 'NHL';
          } else if (cleanTitle.toLowerCase().includes('pwhl')) {
              eventType = 'PWHL';
          } else {
              eventDescription = await page.locator('.event_description').innerText().catch(() => "");
              eventType = assignType(cleanTitle, eventDescription);
          }


          const showtimes = await page.locator('li.listItem.clearfix').all();
          for (const show of showtimes) {
            const dateText = await show.locator('.cell.showings_date').innerText();
            const timeText = await show.locator('.time.cell').innerText();

            // Format date as YYYY-MM-DD
            const parsedDate = new Date(dateText.trim());
            const currentYear = new Date().getFullYear();
            const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
            const day = String(parsedDate.getDate()).padStart(2, '0');
            const formattedDate = `${currentYear}-${month}-${day}`;

            // Format time as 12:00AM or 12:00PM
            const timeMatch = timeText.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
            let formattedTime = timeText.trim();
            if (timeMatch) {
              let hours = parseInt(timeMatch[1]);
              const minutes = timeMatch[2];
              let period = timeMatch[3]?.toUpperCase();

              // If no AM/PM provided, assume 24-hour format
              if (!period) {
                period = hours >= 12 ? 'PM' : 'AM';
                hours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
              }

              formattedTime = `${hours}:${minutes}${period}`;
            }

            allScrapedData.push({
              venue: 'Grand Casino Arena',
              title: cleanTitle,
              date: formattedDate,
              time: formattedTime,
              type: eventType
            });
          }
          console.log(`Successfully grabbed: ${cleanTitle} [${eventType}]`);
        } catch (err) {
          console.log(`Skipping ${detailUrl}: ${err.message}`);
        }
      }
    } else if (url.includes('kfcyumcenter')) {
      console.log(`\nScraping KFC Yum Center...`);

      // --- LOAD ALL EVENTS ---
      try {
        const loadMoreBtn = page.locator('#loadMoreEvents');
        while (await loadMoreBtn.isVisible()) {
            await loadMoreBtn.scrollIntoViewIfNeeded();
            await loadMoreBtn.click();
            await page.waitForTimeout(1500); // wait for boxes to load

        }
      } catch (e) {
        console.log('Finished loading all events.');
      }

      // --- COLLECT LINKS ---
      const eventLinks = await page.locator('h3.title a').all();
      const urlsToVisit = [];

      for (const link of eventLinks) {
          const href = await link.getAttribute('href');
          if (href) urlsToVisit.push(href.startsWith('http') ? href : `https://www.kfcyumcenter.com${href}`);
      }
      const uniqueUrls = [...new Set(urlsToVisit)].filter(url => url.includes('/events/detail/'));
      console.log(`Found ${uniqueUrls.length} unique events to deep scrape.`);

      // --- SCRAPING ---
      for (const detailUrl of uniqueUrls) {
        try {
          await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

          // grab dynamic content
          const eventTitle = await page.locator('h1.title').innerText();

          //click 'more info' if it exists to get full keywords
          try {
            const moreInfoBtn = page.locator('button.read-more');
            if (await moreInfoBtn.isVisible()) {
              await moreInfoBtn.click();
              await page.waitForTimeout(300);
            }
          } catch (e) {}

          const eventDescription = await page.locator('.description_inner').textContent();
          const eventType = categorizeKFC(eventTitle, eventDescription);

          //find showings
          const showtimeItems = await page.locator('ul.list li.listItem').all();

          if (showtimeItems.length === 0) {
            console.log(`No showings found for ${eventTitle}, skipping.`);
            continue;
          }

          for (const show of showtimeItems) {
            //Extract date parts from the nested spans
            const month = await show.locator('.m-date__month').innerText();
            const day = await show.locator('.m-date__day').innerText();
            const time = await show.locator('.time.cell').innerText();

            // format the date time
            const rawDateString = `${month.trim()} ${day.trim()}, 2026`;

            //clean title/date/time
            const { title, date, time: cleanTime } = normalizeData(`${rawDateString} ${time}`, eventTitle);
            const formattedDate = formatDate(date);

            allScrapedData.push({
              venue: 'KFC Yum! Center',
              title: title,
              date: formattedDate,
              time: formatTime(time),
              type: eventType
            });
          }
          console.log(`Pulling: ${eventTitle} [${eventType}]`);
        } catch (err) {
          console.log(`Error scraping ${detailUrl}: ${err.message}`);
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
      {id: 'time', title: 'TIME'},
      {id: 'type', title: 'TYPE'}
    ]
  });

  await csvWriter.writeRecords(allScrapedData);
  console.log('\nDone! Check events.csv');

  await browser.close();
})();