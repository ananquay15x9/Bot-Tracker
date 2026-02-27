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
//Baylor Concert Function Time
function formatBaylorTime(timeStr) {
    if (!timeStr || timeStr === 'TBA') return timeStr;
    let startTime = timeStr.split('-')[0].trim();
    startTime = startTime.replace(/\s*(AM|PM|am|pm)/i, (match, ampm) => ampm.toUpperCase());
    if (/^\d+(?:AM|PM)$/i.test(startTime)) {
        startTime = startTime.replace(/(\d+)(AM|PM)/i, '$1:00$2');
    }
    return startTime;
}

// ======================================================================================
// BAYLOR CONCERT MAIN FUNCTION
async function scrapeBaylorConcert(browser)  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route('**/*', (route) => {
        if (['image', 'media', 'font'].includes(route.request().resourceType())) return route.abort();
        return route.continue();
    });

    let venueData = [];

    try {
        console.log("Navigating to Baylor Concerts main page...");
        await page.goto('https://concerts.web.baylor.edu/upcoming-events', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('a.uiWidget-cards-item', { timeout: 15000 });

        const eventUrls = await page.$$eval('a.uiWidget-cards-item', (links) => {
            return links.map(a => a.href);
        });

        console.log(`Found ${eventUrls.length} events. Crawling...`);

        for (const url of eventUrls) {
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded' });
                await page.waitForSelector('.pub_featuredStory-page-header-content', { timeout: 10000 });

                const bodyText = await page.innerText('body');
                if (!bodyText.includes('Paul and Alejandra Foster Pavilion')) {
                    console.log(`Skipping: Location mismatch for ${title}`);
                    continue;
                }
                await page.waitForSelector('.pub_featuredStory-page-header-content', { timeout: 10000 });
                const title = await page.$eval('h1', el => el.innerText || el.textContent).catch(() => "Unknown Concert");

                const dateLoc = page.locator('.event-date, .uiFrameworkCalendar__event--item.event-date');
                const timeLoc = page.locator('.uiFrameworkCalendar__event--time, .time-container');

                let rawDate = (await dateLoc.count() > 0) ? await dateLoc.first().innerText() : "TBA";
                let rawTime = (await timeLoc.count() > 0) ? await timeLoc.first().innerText() : "TBA";

                rawTime = rawTime.split('-')[0].trim();
                venueData.push({
                    venue: 'Foster Pavilion',
                    title: title.trim(),
                    date: formatDate(rawDate.trim()),
                    time: formatBaylorTime(rawTime.trim()),
                    type: 'Concert'
                });
                console.log(`--Pulling: ${title.trim()}--`);


            } catch (err) {
                console.log(`Skip because mismatch location: ${url}`);
            }
        }

        } catch (e) { console.log("Baylor failed: ", e); }
        await page.close();
        await context.close();
        return venueData;
    }


// =======================================================================================

(async () => {
    const browser = await chromium.launch ({ headless: false });

    //run them one by one to keep memory clean
    const results = await Promise.all([
        scrapeBaylorConcert(browser)
    ]);

    // flatten the array
    const allData = results.flat();

    //log the count
    console.log(`\nTotal events scraped: ${allData.length}`);

    // write to CSV
    const csvWriter = createCsvWriter({
        path: 'calendar-3.csv',
        header: [
            { id: 'venue', title: 'VENUE' },
            { id: 'title', title: 'EVENT NAME' },
            { id: 'date', title: 'DATE' },
            { id: 'time', title: 'TIME' },
            { id: 'type', title: 'TYPE' }
        ]
    });

    // write the data
    if (allData.length > 0) {
        await csvWriter.writeRecords(allData);
        console.log('Done! All events saved to calendar-3.csv');
    } else {
        console.log('No data to write to CSV.');
    }

    await browser.close();
})();