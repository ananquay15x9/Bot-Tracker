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

//DOM KILL FOR XFINITY CENTER SPORT
async function setupTranscendKillerXS(page) {
    await page.addStyleTag({
        content: `
            #transcend-consent-manager,
            .satisfi_btn,
            .satisfi_container,
            #satisfi_chat_container,
            .satisfi_close {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
            }
        `
    });

    await page.addInitScript(() => {
        const kill = () => {
            const transcend = document.querySelector('#transcend-consent-manager');
            if (transcend) transcend.remove();

            const satisfiElements = document.querySelectorAll('.satisfi_btn, .satisfi_container, #satisfi_chat_container');
            satisfiElements.forEach(el => el.remove());

            document.documentElement.style.setProperty('overflow', 'auto', 'important');
            document.body.style.setProperty('overflow', 'auto', 'important');
            document.body.style.setProperty('position', 'static', 'important');
        };

        kill();
        const obs = new MutationObserver(() => kill());
        obs.observe(document.documentElement, { childList: true, subtree: true });
    });

    await page.route('**/*', (route) => {
        const u = route.request().url();
        if (
            u.includes('transcend-cdn.com') ||
            u.includes('transcend.io') ||
            u.includes('satisfi')
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

// Xfinity Center - Sports
async function scrapeXfinityS(browser)  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await setupTranscendKillerXS(page);

    let venueData = [];
    const today = new Date();
    const currentYear = today.getFullYear();

        try {
            console.log("Navigating to Maryland Xfinity Calendar...");
            await page.goto('https://umterps.com/calendar', { waitUntil: 'domcontentloaded' });

            const monthHeader = page.locator('[data-bind*="formatDate: selectedDate"]').first();
            await monthHeader.waitFor({ timeout: 15000 });

            for (let m = 0; m < 12; m++) {
                await page.waitForSelector('.sidearm-calendar-table-cell', { timeout: 10000 });
                let monthText = await monthHeader.innerText();
                const [monthName, yearName] = monthText.split(' ');
                if (parseInt(yearName) > currentYear) break;

                console.log(`Processing: ${monthText}`);

                await page.evaluate(() => {
                    const buttons = document.querySelectorAll('.sidearm-calendar-table-cell-toggle-button');
                    buttons.forEach(btn => {
                        const container = btn.closest('.sidearm-calendar-table-cell-container');
                        if (container && !container.classList.contains('sidearm-calendar-table-cell-container-open')) {
                            btn.click();
                        }
                    });
                });
                await page.waitForTimeout(1500);

                const monthEvents = await page.evaluate(({ monthName, yearName }) => {
                    const results = [];
                    const monthMap = { 'January':1,'February':2,'March':3,'April':4,'May':5,'June':6,'July':7,'August':8,'September':9,'October':10,'November':11,'December':12 };
                    const cells = document.querySelectorAll('.sidearm-calendar-table-cell');
                    const dateMap = new Map();

                    cells.forEach((cell, index) => {
                        const timeTag = cell.querySelector('time[data-bind*="formatDate: date"]');
                        dateMap.set(index, timeTag ? timeTag.innerText.trim() : "");
                    });

                    //  expand the grid
                    document.querySelectorAll('.sidearm-calendar-table-cell-toggle-button').forEach(btn => {
                        const container = btn.closest('.sidearm-calendar-table-cell-container');
                        if (container && !container.classList.contains('sidearm-calendar-table-cell-container-open')) {
                            btn.click();
                        }
                    });

                    cells.forEach((cell, index) => {
                        const dayNum = dateMap.get(index);
                        if (!dayNum) return;

                        const dateISO = `${yearName}-${String(monthMap[monthName]).padStart(2, '0')}-${dayNum.padStart(2, '0')}`;
                        const events = cell.querySelectorAll('li.sidearm-calendar-table-cell-event');

                        events.forEach(event => {
                            const locText = event.querySelector('[data-bind*="location"]')?.innerText.trim() || "";

                            if (locText === "College Park, MD") {
                                const sportCode = event.querySelector('span[data-bind*="sport.short_display"]')?.innerText.trim() || "";
                                const title = event.querySelector('p')?.innerText.trim() || "";


                                let time = event.querySelector('span[data-bind*="time"]')?.innerText.trim() || "";
                                if (!time) {
                                    const link = event.querySelector('a[aria-label*="at "]');
                                    if (link) {
                                        const aria = link.getAttribute('aria-label');
                                        const match = aria.match(/at\s+([^ ]+\s+[^ ]+)/);
                                        time = match ? match[1].trim() : "TBA";
                                    }
                                }

                                results.push({
                                    title,
                                    sportCode,
                                    time: time || "TBA",
                                    dateISO
                                });
                            }
                        });
                    });
                    return results;
                }, { monthName, yearName });


                for (const ev of monthEvents) {
                    console.log(`Pulling Event: ${JSON.stringify(ev)}`);

                    if (new Date(ev.dateISO) < new Date().setHours(0,0,0,0)) continue;

                    let type = 'Other';

                    const searchStr = (ev.title + " " + (ev.sportCode || "")).toUpperCase();

                    if (searchStr.includes('MBB') || searchStr.includes("MEN'S BASKETBALL")) {
                        type = 'NCAA MB';
                    }
                    else if (searchStr.includes('WBB') || searchStr.includes("WOMEN'S BASKETBALL")) {
                        type = 'NCAA WB';
                    }

                    else if (searchStr.includes('VOLLEYBALL') || searchStr.includes('WVB')) {
                        type = 'NCAA WVB';
                    }

                    else if (searchStr.includes('CONCERT') || searchStr.includes('TOUR') || searchStr.includes('SHOW')) {
                        type = 'Concert';
                    }

                    // all other sports fall into 'other'

                    venueData.push({
                        venue: 'Xfinity Center',
                        title: ev.title,
                        date: ev.dateISO,
                        time: formatTime(ev.time),
                        type: type
                    });
                }

                const nextBtn = page.locator('.slick-next').first();
                await nextBtn.click();
                await page.waitForFunction(
                    (old) => document.querySelector('[data-bind*="formatDate: selectedDate"]').innerText !== old,
                    monthText,
                    { timeout: 8000 }
                ).catch(() => { m = 13; });
            }

        } catch (e) { console.log("Xfinity Center Sports failed: ", e); }
        await page.close();
        await context.close();
        return venueData;
    }


// Xfinity Center - Sports
async function scrapeXfinityE(browser)  {
    const context = await browser.newContext();
    const page = await context.newPage();

    let venueData = [];

    try {
        console.log("Navigating to Ticketmaster...");

        await page.goto('https://www.ticketmaster.com/xfinity-center-tickets-college-park/venue/172349', {
            waitUntil: 'domcontentloaded'
        });

        await page.waitForSelector('.gCZRzf', { timeout: 15000 });

        const events = await page.evaluate(() => {
            const results = [];
            const items = document.querySelectorAll('.gCZRzf');

            items.forEach(item => {

                const hiddenSpans = Array.from(item.querySelectorAll('.VisuallyHidden-sc-8buqks-0 span'));

                const dateRaw = hiddenSpans[0]?.innerText || "";
                const timeRaw = hiddenSpans[1]?.innerText || "";
                const title = hiddenSpans[2]?.innerText || item.querySelector('.gRLkJL')?.innerText || "";

                results.push({ dateRaw, timeRaw, title });
            });
            return results;
        });

        for (const ev of events) {
            if (!ev.title) continue;

            let cleanTitle = ev.title.split(',')[0].trim();


            let type = 'Concert';
            const t = ev.title.toLowerCase();

            if (t.includes('mens basketball') || t.includes('mbb')) {
                type = 'NCAA MB';
            } else if (t.includes('womens basketball') || t.includes('wbb')) {
                type = 'NCAA WB';
            } else if (t.includes('volleyball')) {
                type = 'NCAA WVB';
            }


            const timeClean = ev.timeRaw.replace(/^[a-zA-Z]+\s+0?/, '').trim();


            const dateParts = ev.dateRaw.replace(',', '').split(' ');
            const monthMap = { 'January':'01','February':'02','March':'03','April':'04','May':'05','June':'06','July':'07','August':'08','September':'09','October':'10','November':'11','December':'12' };
            const dateISO = dateParts.length === 3 ? `${dateParts[2]}-${monthMap[dateParts[0]]}-${dateParts[1].padStart(2, '0')}` : ev.dateRaw;

            venueData.push({
                venue: 'Xfinity Center',
                title: cleanTitle,
                date: dateISO,
                time: timeClean,
                type: type
            });
        }

        console.log(`Got ${venueData.length} events.`);

        } catch (e) { console.log("Xfinity Center Events failed: ", e); }
        await page.close();
        await context.close();
        return venueData;
    }

// Mizzou Arena - Men's Basketball Main FUNCTION
// KILL TRANSCEND
async function setupTranscendKillerMizzouMB(page) {
    await page.addInitScript(() => {
        const kill = () => {
            const host = document.querySelector('#transcend-consent-manager');
            if (host) host.remove();
            document.documentElement.style.overflow = 'auto';
            document.body.style.overflow = 'auto';
            document.body.style.position = 'static';
        };
        kill();
        const obs = new MutationObserver(() => kill());
        obs.observe(document.documentElement, { childList: true, subtree: true });
    });

    await page.route('**/*', (route) => {
        const u = route.request().url();
        if (u.includes('transcend-cdn.com/cm/') || u.includes('transcend.io')) {
            return route.abort();
        }
        return route.continue();
    });
}

function formatTimeMMB(rawTime) {
    if (!rawTime || rawTime.toLowerCase().includes('tba')) return 'TBA';

    // 1. Remove periods (p.m. -> pm)
    let clean = rawTime.replace(/\./g, '').toLowerCase().trim();

    // 2. Standardize AM/PM casing and spacing
    // This turns "7 pm" or "7:30 pm" into "7:00PM" or "7:30PM"
    let formatted = clean.replace(/\s*(am|pm)/i, (match, p1) => p1.toUpperCase());

    // 3. Ensure minutes exist (7PM -> 7:00PM)
    if (!formatted.includes(':') && (formatted.includes('AM') || formatted.includes('PM'))) {
        formatted = formatted.replace(/(\d+)/, '$1:00');
    }

    return formatted;
}

async function scrapeMizzouMB(browser) {
	const page = await browser.newPage();
    await setupTranscendKillerMizzouMB(page);

	await page.goto('https://mutigers.com/sports/mens-basketball/schedule/2025-26');

    const venueDataMMB = [];

    await page.waitForSelector('[data-test-id="s-game-card-standard__root"]');

    const gameCards = await page.locator('[data-test-id="s-game-card-standard__root"]').all();
    console.log(`Found ${gameCards.length} scheduled games.`);

    for (const card of gameCards) {
        try {
            const venueLoc = card.locator('[data-test-id*="game-facility-title-link"]');
            const cityLoc = card.locator('[data-test-id*="standard-location-details"]');

            if (await venueLoc.count() === 0) continue;

            const venueName = await venueLoc.innerText();
            const cityText = await cityLoc.innerText();

            if (venueName.includes('Mizzou Arena') && cityText.includes('Columbia')) {

                const opponent = await card.locator('[data-test-id="s-game-card-standard__header-team-opponent-link"]').innerText();

                // 1. DATE EXTRACTION
                let rawDate = "";
                const futureDateLoc = card.locator('[data-test-id="s-game-card-standard__header-game-date"]');
                const pastDateLoc = card.locator('[data-test-id="s-game-card-standard__header-game-date-details"]');

                if (await pastDateLoc.count() > 0) {
                    rawDate = await pastDateLoc.innerText();
                } else {
                    rawDate = await futureDateLoc.innerText();
                }


                const month = rawDate.split(' ')[0];
                const yearStr = (month === 'Nov' || month === 'Dec') ? '2025' : '2026';
                const cleanDate = formatDate(`${rawDate} ${yearStr}`);


                let gameTime = "TBA";
                const timeLoc = card.locator('[aria-label="Event Time"]');
                if (await timeLoc.count() > 0) {
                    gameTime = await timeLoc.innerText();
                }

                venueDataMMB.push({
                    venue: 'Mizzou Arena',
                    title: `Missouri vs ${opponent.trim()}`,
                    date: cleanDate,
                    time: formatTimeMMB(gameTime),
                    type: 'NCAA MB'
                });

                console.log(`Pulling Mizzou MBB vs ${opponent.trim()} on ${cleanDate}`);
            }

        } catch (e) { console.log(`Mizzou Arena Men's Basketball failed: ${e.message}`); }
    }
        await page.close();
        return venueDataMMB;
}

// MIZZOU ARENA WOMEN BASKETBALL MAIN FUNCTION
async function setupTranscendKillerMWB(page) {
    await page.addInitScript(() => {
        const kill = () => {
            const host = document.querySelector('#transcend-consent-manager');
            if (host) host.remove();
            document.documentElement.style.overflow = 'auto';
            document.body.style.overflow = 'auto';
            document.body.style.position = 'static';
        };
        kill();
        const obs = new MutationObserver(() => kill());
        obs.observe(document.documentElement, { childList: true, subtree: true });
    });

    await page.route('**/*', (route) => {
        const u = route.request().url();
        if (u.includes('transcend-cdn.com/cm/') || u.includes('transcend.io')) {
            return route.abort();
        }
        return route.continue();
    });
}

function formatTimeMWB(rawTime) {
    if (!rawTime || rawTime.toLowerCase().includes('tba')) return 'TBA';

    // 1. Remove periods (p.m. -> pm)
    let clean = rawTime.replace(/\./g, '').toLowerCase().trim();

    // 2. Standardize AM/PM casing and spacing
    // This turns "7 pm" or "7:30 pm" into "7:00PM" or "7:30PM"
    let formatted = clean.replace(/\s*(am|pm)/i, (match, p1) => p1.toUpperCase());

    // 3. Ensure minutes exist (7PM -> 7:00PM)
    if (!formatted.includes(':') && (formatted.includes('AM') || formatted.includes('PM'))) {
        formatted = formatted.replace(/(\d+)/, '$1:00');
    }

    return formatted;
}

async function scrapeMizzouWB(browser) {
	const page = await browser.newPage();
    await setupTranscendKillerMWB(page);

	await page.goto('https://mutigers.com/sports/womens-basketball/schedule/2025');

    const venueDataMWB = [];

    await page.waitForSelector('[data-test-id="s-game-card-standard__root"]');

    const gameCards = await page.locator('[data-test-id="s-game-card-standard__root"]').all();
    console.log(`Found ${gameCards.length} scheduled games.`);

    for (const card of gameCards) {
        try {
            const venueLoc = card.locator('[data-test-id*="game-facility-title-link"]');
            const cityLoc = card.locator('[data-test-id*="standard-location-details"]');

            if (await venueLoc.count() === 0) continue;

            const venueName = await venueLoc.innerText();
            const cityText = await cityLoc.innerText();

            if (venueName.includes('Mizzou Arena') && cityText.includes('Columbia')) {

                const opponent = await card.locator('[data-test-id="s-game-card-standard__header-team-opponent-link"]').innerText();


                let rawDate = "";
                const futureDateLoc = card.locator('[data-test-id="s-game-card-standard__header-game-date"]');
                const pastDateLoc = card.locator('[data-test-id="s-game-card-standard__header-game-date-details"]');

                if (await pastDateLoc.count() > 0) {
                    rawDate = await pastDateLoc.innerText();
                } else {
                    rawDate = await futureDateLoc.innerText();
                }


                const month = rawDate.split(' ')[0];
                const yearStr = (month === 'Nov' || month === 'Dec') ? '2025' : '2026';
                const cleanDate = formatDate(`${rawDate} ${yearStr}`);


                let gameTime = "TBA";
                const timeLoc = card.locator('[aria-label="Event Time"]');
                if (await timeLoc.count() > 0) {
                    gameTime = await timeLoc.innerText();
                }

                venueDataMWB.push({
                    venue: 'Mizzou Arena',
                    title: `Missouri vs ${opponent.trim()}`,
                    date: cleanDate,
                    time: formatTimeMWB(gameTime),
                    type: 'NCAA WB'
                });

                console.log(`Pulling Mizzou WB vs ${opponent.trim()} on ${cleanDate}`);
            }

        } catch (e) { console.log(`Mizzou Arena Women's Basketball failed: ${e.message}`); }
    }
        await page.close();
        return venueDataMWB;
}

// MIZZOU ARENA EVENTS MAIN FUNCTION
async function scrapeMizzouE(browser) {
    const context = await browser.newContext();
    const page = await context.newPage();
    let venueDataME = [];

    try {
        console.log("Navigating to Mizzou Arena Ticketmaster...");

        await page.goto('https://www.ticketmaster.com/mizzou-arena-tickets-columbia/venue/50091', {
            waitUntil: 'domcontentloaded'
        });

        await page.waitForSelector('.gCZRzf', { timeout: 15000 });

        const events = await page.evaluate(() => {
            const results = [];
            const items = document.querySelectorAll('.gCZRzf');

            items.forEach(item => {

                const hiddenSpans = Array.from(item.querySelectorAll('.VisuallyHidden-sc-8buqks-0 span'));

                const dateRaw = hiddenSpans[0]?.innerText || "";
                const timeRaw = hiddenSpans[1]?.innerText || "";
                const title = hiddenSpans[2]?.innerText || item.querySelector('.gRLkJL')?.innerText || "";

                results.push({ dateRaw, timeRaw, title });
            });
            return results;
        });

        for (const ev of events) {
            if (!ev.title) continue;

            let cleanTitle = ev.title.split(',')[0].trim();


            let type = 'Concert';
            const t = ev.title.toLowerCase();

            if (t.includes('mens basketball') || t.includes('mbb')) {
                type = 'NCAA MB';
            } else if (t.includes('womens basketball') || t.includes('wbb')) {
                type = 'NCAA WB';
            } else if (t.includes('volleyball')) {
                type = 'NCAA WVB';
            }


            const timeClean = ev.timeRaw.replace(/^[a-zA-Z]+\s+0?/, '').trim();


            const dateParts = ev.dateRaw.replace(',', '').split(' ');
            const monthMap = { 'January':'01','February':'02','March':'03','April':'04','May':'05','June':'06','July':'07','August':'08','September':'09','October':'10','November':'11','December':'12' };
            const dateISO = dateParts.length === 3 ? `${dateParts[2]}-${monthMap[dateParts[0]]}-${dateParts[1].padStart(2, '0')}` : ev.dateRaw;

            venueDataME.push({
                venue: 'Mizzou Arena',
                title: cleanTitle,
                date: dateISO,
                time: timeClean,
                type: type
            });
        }
        console.log(`Got ${venueData.length} events.`);

        } catch (e) { console.log(`Mizzou Arena Events failed: ${e.message}`); }
        await page.close();
        return venueDataME;
    }

// Providence Park Timber MAIN FUNCTIOn
//date format
function formatDatePT(dateStr) {
    if (!dateStr || dateStr === 'TBA') return dateStr;

    // Clean up the string but DO NOT remove slashes anymore
    dateStr = dateStr.replace(/,\s*$/, '').trim();

    // 1. Handle numeric format (e.g., 3/7, 11/1, 10/24)
    const numericMatch = dateStr.match(/(\d+)\/(\d+)/);
    if (numericMatch) {
        const month = numericMatch[1].padStart(2, '0');
        const day = numericMatch[2].padStart(2, '0');
        return `2026-${month}-${day}`;
    }

    // 2. Handle standard text format (e.g., March 7, 2026)
    const monthMap = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
    };

    const textMatch = dateStr.match(/([A-Za-z]+)\.?\s+(\d+)(?:\s+(\d{4}))?/);
    if (textMatch) {
        const month = monthMap[textMatch[1].toLowerCase().substring(0, 3)];
        const day = textMatch[2].padStart(2, '0');
        const year = textMatch[3] || '2026';
        if (month) return `${year}-${month}-${day}`;
    }

    return dateStr;
}

// TIME FORMAT
function formatTimePT(timeStr) {
    if (!timeStr || timeStr === 'TBA' || timeStr.length < 3) return 'TBA';


    let clean = timeStr.replace(/\s+/g, '').toUpperCase();


    if (/^\d+(AM|PM)$/.test(clean)) {
        clean = clean.replace(/(\d+)/, '$1:00');
    }

    return clean;
}

async function scrapeProvidenceT(browser) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const venueDataPT = [];

    try {
        console.log("Navigating to Providence Park...");
        await page.goto('https://www.timbers.com/schedule/#competition=all&date=2026-02-19', { 
            waitUntil: 'domcontentloaded',
            timeout: 60000 
        });

        await page.waitForSelector('.mls-c-match-tile, [class*="match-tile"]', { timeout: 25000 }).catch(async e => {
            console.log("Timed out waiting for tiles. Saving screenshot to debug...");
            await page.screenshot({ path: 'providence_debug.png' });
            throw e;
        });


        const matches = await page.evaluate(() => {
            const results = [];
            const matchAnchors = document.querySelectorAll('a[href*="/matches/"]');

            matchAnchors.forEach(anchor => {
                const row = anchor.closest('.mls-c-match-list__match');
                const dateText = row?.querySelector('.mls-c-status-stamp__status')?.innerText.trim() || "";
                const dateEl = anchor.closest('.mls-c-match-list__match')?.querySelector('.mls-c-status-stamp__status');

                if (dateText.toLowerCase().includes('final')) return;


                const infoBlock = anchor.closest('.mls-c-match-list__match')?.querySelector('.mls-c-match-list__match-info');
                const competition = row?.querySelector('.mls-c-explainer-bar, .mls-c-match-list__match-info p')?.innerText.trim() || "";
                const venue = row?.querySelector('.sc-iveFHk, .mls-c-match-list__match-info p:last-child')?.innerText.trim() || "";


                const home = anchor.querySelector('.--home .mls-c-club__shortname')?.innerText.trim() || "";
                const away = anchor.querySelector('.--away .mls-c-club__shortname')?.innerText.trim() || "";
                const time = anchor.querySelector('.mls-c-scorebug span')?.innerText.trim() || "TBA";


                if (venue.includes("Providence Park") || venue === "") {
                    results.push({
                        title: `${home} vs ${away}`,
                        date: dateText,
                        time: time,
                        competition: competition
                    });
                }
            });
            return results;
        });


        for (const m of matches) {
            let type = 'Other';
            const comp = m.competition.toLowerCase();
            if (comp.includes('mls')) type = 'MLS';
            else if (comp.includes('nwsl')) type = 'NWSL';
            else if (comp.includes('next pro')) type = 'MLS Next Pro';

            venueDataPT.push({
                venue: 'Providence Park',
                title: m.title,
                date: formatDatePT(m.date),
                time: formatTimePT(m.time),
                type: type
            });
        }

        console.log(`Successfully captured ${venueDataPT.length} home matches.`);

        } catch (e) { console.log(`Providence Park Timbers failed: ${e.message}`); }
        await page.close();
        return venueDataPT;

    }

// Providence Park Thorns MAIN FUNCTION
function formatDateThorns(dateStr) {
    if (!dateStr || dateStr === 'TBA') return dateStr;
    dateStr = dateStr.replace(/,\s*$/, '').trim();

    const monthMap = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
    };

    // Surgical match for "Mar 6"
    const textMatch = dateStr.match(/([A-Za-z]+)\.?\s+(\d+)/);
    if (textMatch) {
        const month = monthMap[textMatch[1].toLowerCase().substring(0, 3)];
        const day = textMatch[2].padStart(2, '0');
        if (month) return `2026-${month}-${day}`;
    }
    return dateStr;
}

function formatTimeThorns(timeStr) {
    if (!timeStr || timeStr === 'TBA') return timeStr;
    let clean = timeStr.replace(/\s+/g, '').toUpperCase();
    if (/^\d+(AM|PM)$/.test(clean)) {
        clean = clean.replace(/(\d+)/, '$1:00');
    }
    return clean;
}

async function scrapeProvidenceThorns(browser) {
    const context = await browser.newContext();
    const page = await context.newPage();

    const venueDataPThorns = [];

    try {
        console.log("Navigating to Thorns Schedule...");
        await page.goto('https://www.thorns.com/schedule', { waitUntil: 'domcontentloaded' });


        try {
            console.log("Trying to bypass cookie modal...");

            await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 10000 });

            await page.evaluate(() => {
                const btn = document.querySelector('#onetrust-accept-btn-handler');
                if (btn) {
                    btn.click();
                }
            });
            console.log("Cookies accepted.");

            await page.waitForSelector('.onetrust-pc-dark-filter', { state: 'hidden', timeout: 5000 }).catch(() => {});
        } catch (e) {
            console.log("Cookie modal not found or already dismissed....");
        }


        console.log("Scrolling to load all events...");
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                let distance = 100;
                let timer = setInterval(() => {
                    let scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });
        await page.waitForTimeout(2000);


        const matches = await page.evaluate(() => {
            const results = [];

            const rows = document.querySelectorAll('.match-row');

            rows.forEach(row => {
                const location = row.querySelector('.match-detail-row.location')?.innerText || "";


                if (location.toUpperCase().includes("PORTLAND, OR")) {
                    const title = row.querySelector('.div-block-5')?.innerText.replace(/\s+/g, ' ').trim() || "";

                    const dateTimeStr = row.querySelector('.match-detail-row.date')?.innerText || "";
                    const parts = dateTimeStr.split('|');

                    const dateRaw = parts[0] ? parts[0].trim() : "";
                    const timeRaw = parts[1] ? parts[1].trim() : "TBA";

                    results.push({
                        title: title,
                        date: dateRaw,
                        time: timeRaw
                    });
                }
            });
            return results;
        });

        for (const m of matches) {

            let cleanTitle = m.title.split('Opening Night')[0].trim();
            cleanTitle = cleanTitle.split('presented by')[0].trim();

            venueDataPThorns.push({
                venue: 'Providence Park',
                title: cleanTitle,
                date: formatDateThorns(m.date),
                time: formatTimeThorns(m.time),
                type: 'NWSL'
            });
        }

        } catch (e) { console.log(`Providence Park Thorns failed: ${e.message}`); 
    }   finally {
        await page.close();
        await context.close();
    }
    return venueDataPThorns;

    }

// SHELL ENERGY STADIUM MAIN FUNCTION
function formatDateSD(dateStr) {
    if (!dateStr || dateStr === 'TBA') return dateStr;
    const monthMap = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
    };
    const match = dateStr.match(/([A-Za-z]+)\.?\s+(\d+)/i);
    if (match) {
        const month = monthMap[match[1].toLowerCase().substring(0, 3)];
        const day = match[2].padStart(2, '0');
        return `2026-${month}-${day}`;
    }
    return dateStr;
}

function formatTimeSD(timeStr) {
    if (!timeStr || timeStr === 'TBA') return timeStr;
    let clean = timeStr.replace(/\s+/g, '').toUpperCase();
    if (/^\d+(AM|PM)$/.test(clean)) {
        clean = clean.replace(/(\d+)/, '$1:00');
    }
    return clean;
}

async function scrapeShellDynamo(browser)  {
    const context = await browser.newContext();
    const page = await context.newPage();

    const venueData = [];

    try {
        console.log("Navigating to Shell Energy Stadium Events...");
        await page.goto('https://www.houstondynamofc.com/shell-energy-stadium/events', { waitUntil: 'domcontentloaded' });


        try {
            await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 10000 });
            await page.evaluate(() => document.querySelector('#onetrust-accept-btn-handler')?.click());
            console.log("Cookies accepted.");
            await page.waitForTimeout(1000);
        } catch (e) { console.log("Cookie modal not found."); }


        const events = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('.fa-text');

            cards.forEach(card => {
                const title = card.querySelector('.fa-text__title')?.innerText.trim() || "";
                const bodyText = card.querySelector('.fa-text__body p')?.innerText || "";

                const dateMatch = bodyText.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d+/i);
                const timeMatch = bodyText.match(/(\d{1,2}:\d{2}\s*(?:p\.m\.|a\.m\.|pm|am))/i);

                if (dateMatch && title) {
                    results.push({
                        title: title,
                        rawDate: dateMatch[0],
                        rawTime: timeMatch ? timeMatch[0] : "TBA"
                    });
                }
            });
            return results;
        });


        for (const ev of events) {
            let type = 'Other';
            if (ev.title.toLowerCase().includes('dash')) type = 'NWSL';
            else if (ev.title.toLowerCase().includes('dynamo')) type = 'MLS';
            else if (ev.title.toLowerCase().includes('concert')) type = 'Concert';

            venueData.push({
                venue: 'Shell Energy Stadium',
                title: ev.title,
                date: formatDateSD(ev.rawDate),
                time: formatTimeSD(ev.rawTime.replace(/\./g, '')), // Remove periods from p.m.
                type: type
            });
        }

        console.log(`Success! Pulling ${venueData.length} events.`);

        } catch (e) { console.log("Shell Energy Stadium Dynamo failed: ", e); }
        await page.close();
        await context.close();
        return venueData;
    }

// SHELL ENERGY DASH MAIN FUNCTION
function formatDateDash(dateStr) {
    if (!dateStr || dateStr === 'TBA') return dateStr;


    const cleanDate = dateStr.split(',').slice(1).join(',').trim().split('\n')[0].trim();

    const monthMap = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
    };

    const match = cleanDate.match(/([A-Za-z]+)\s+(\d+)/i);
    if (match) {
        const month = monthMap[match[1].toLowerCase().substring(0, 3)];
        const day = match[2].padStart(2, '0');
        return `2026-${month}-${day}`;
    }
    return dateStr;
}

function formatTimeDash(timeStr) {
    if (!timeStr || timeStr === 'TBA') return timeStr;

    let clean = timeStr.replace(/CT/i, '').replace(/\./g, '').replace(/\s+/g, '').toUpperCase();

    if (/^\d+(AM|PM)$/.test(clean)) {
        clean = clean.replace(/(\d+)/, '$1:00');
    }
    return clean;
}

async function scrapeShellDash(browser)  {
    const context = await browser.newContext();
    const page = await context.newPage();

    const venueData = [];

    try {
        console.log("Navigating to Dash Schedule...");
        await page.goto('https://www.houstondynamofc.com/houstondash/schedule/', { waitUntil: 'domcontentloaded' });


        try {
            await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 10000 });
            await page.evaluate(() => document.querySelector('#onetrust-accept-btn-handler')?.click());
            console.log("Cookies accepted.");
        } catch (e) { console.log("Cookie modal not found."); }

        const rows = await page.evaluate(() => {
            const results = [];
            const trs = Array.from(document.querySelectorAll('tbody tr'));

            trs.slice(1).forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 7) return;

                const dateRaw = cells[0].innerText.trim();
                const opponentRaw = cells[1].innerText.trim();
                const stadium = cells[2].innerText.trim();
                const kickoff = cells[6].innerText.trim();


                if (stadium.includes("Shell Energy Stadium")) {
                    results.push({
                        title: opponentRaw,
                        date: dateRaw,
                        time: kickoff
                    });
                }
            });
            return results;
        });

        for (const r of rows) {
            let type = 'Other';
            const t = r.title.toLowerCase();

            if (t.includes('dash')) type = 'NWSL';
            else if (t.includes('dynamo')) type = 'MLS';
            else if (t.includes('concert') || t.includes('tour')) type = 'Concert';

            venueData.push({
                venue: 'Shell Energy Stadium',
                title: r.title.replace(/\s+/g, ' ').trim(),
                date: formatDateDash(r.date),
                time: formatTimeDash(r.time),
                type: type
            });
        }

        console.log(`Success! Pulling ${venueData.length} home games.`);

        } catch (e) { console.log("Shell Energy Stadium Dash failed: ", e); }
    await page.close();
    await context.close();
    return venueData;
}

// SUBARU UNION MAIN FUNCTION
function formatDateSU(dateStr) {
    if (!dateStr || dateStr === 'TBA') return dateStr;
    dateStr = dateStr.replace(/,\s*$/, '').trim();


    const numericMatch = dateStr.match(/(\d+)\/(\d+)/);
    if (numericMatch) {
        const month = numericMatch[1].padStart(2, '0');
        const day = numericMatch[2].padStart(2, '0');
        return `2026-${month}-${day}`;
    }
    return dateStr;
}

function formatTimeSU(timeStr) {
    if (!timeStr || timeStr === 'TBA' || timeStr.length < 3) return 'TBA';
    let clean = timeStr.replace(/\s+/g, '').toUpperCase();
    if (/^\d+(AM|PM)$/.test(clean)) {
        clean = clean.replace(/(\d+)/, '$1:00');
    }
    return clean;
}

async function scrapeSubaruUnion(browser)  {
    const context = await browser.newContext();
    const page = await context.newPage();

    const venueData = [];

    try {
        console.log("Navigating to Subaru Park Schedule...");
        await page.goto('https://www.philadelphiaunion.com/schedule/#competition=all&date=2026-02-10', { 
            waitUntil: 'domcontentloaded' 
        });


        try {
            const closePopup = page.locator('#closeIconContainer, [data-testid="closeIcon"]');
            await closePopup.waitFor({ timeout: 5000 });
            await closePopup.click();
            console.log("Marketing popup dismissed.");
        } catch (e) { console.log("No marketing popup appeared."); }


        try {
            const cookieBtn = page.locator('#onetrust-accept-btn-handler');
            await cookieBtn.waitFor({ timeout: 5000 });
            await cookieBtn.click();
            console.log("Cookies accepted.");
        } catch (e) { console.log("No cookie modal found."); }


        await page.waitForSelector('.mls-c-match-tile', { timeout: 15000 });

        const matches = await page.evaluate(() => {
            const results = [];
            const matchAnchors = document.querySelectorAll('a[href*="/matches/"]');

            matchAnchors.forEach(anchor => {
                const row = anchor.closest('.mls-c-match-list__match');
                const statusText = row?.querySelector('.mls-c-status-stamp__status')?.innerText.trim() || "";


                if (statusText.toLowerCase().includes('final')) return;

                const competition = row?.querySelector('.mls-c-explainer-bar, .mls-c-match-list__match-info p')?.innerText.trim() || "";
                const venue = row?.querySelector('.sc-iveFHk, .mls-c-match-list__match-info p:last-child')?.innerText.trim() || "";

                const home = anchor.querySelector('.--home .mls-c-club__shortname')?.innerText.trim() || "";
                const away = anchor.querySelector('.--away .mls-c-club__shortname')?.innerText.trim() || "";
                const time = anchor.querySelector('.mls-c-scorebug span')?.innerText.trim() || "TBA";

                if (venue.includes("Subaru Park")) {
                    results.push({
                        title: `${home} vs ${away}`,
                        date: statusText,
                        time: time,
                        competition: competition
                    });
                }
            });
            return results;
        });

        for (const m of matches) {
            let type = 'Other';
            const comp = m.competition.toLowerCase();
            
            if (comp.includes('mls regular season')) type = 'MLS';
            else if (comp.includes('next pro')) type = 'MLS Next Pro';
            else if (comp.includes('concert')) type = 'Concert';

            venueData.push({
                venue: 'Subaru Park',
                title: m.title,
                date: formatDateSU(m.date),
                time: formatTimeSU(m.time),
                type: type
            });
        }

        console.log(`Success! Pulling ${venueData.length} home matches.`);

        } catch (e) { console.log("Subaru Park Union failed: ", e); }
    await page.close();
    await context.close();
    return venueData;
}

// SUBARU PPL MAIN FUNCTION
function formatDatePPL(dateStr) {
    if (!dateStr || dateStr === 'TBA') return dateStr;
    const monthMap = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
    };
    const match = dateStr.match(/([A-Za-z]{3}),?\s+([A-Za-z]{3})\s+(\d+)/i);
    if (match) {
        const month = monthMap[match[2].toLowerCase()];
        const day = match[3].padStart(2, '0');
        return `2026-${month}-${day}`;
    }
    return dateStr;
}

function formatTimePPL(timeStr) {
    if (!timeStr || timeStr === 'TBA') return 'TBA';
    let clean = timeStr.replace(/\s+/g, '').toUpperCase();
    if (/^\d+(AM|PM)$/.test(clean)) {
        clean = clean.replace(/(\d+)/, '$1:00');
    }
    return clean;
}

async function scrapeSubaruPPL(browser)  {
    const context = await browser.newContext();
    const page = await context.newPage();

    const venueData = [];

    try {
        console.log("Navigating to Subaru Park PLL Schedule...");
        // Switch to domcontentloaded to bypass heavy background trackers
        await page.goto('https://premierlacrosseleague.com/schedule', { 
            waitUntil: 'domcontentloaded', 
            timeout: 60000 
        });



        console.log("Locating Philadelphia slide...");

        await page.waitForSelector('.mainText:has-text("Philadelphia, PA")', { timeout: 20000 });
        
        //brute force to find Philadelphia schedule
        await page.evaluate(async () => {
            const wrapper = document.querySelector('.swiper-wrapper');
            let found = false;

            for (let i = 0; i < 30; i++) {
                const slides = Array.from(document.querySelectorAll('.swiper-slide'));
                const philly = slides.find(s => s.innerText.includes("Philadelphia, PA"));

                if (philly) {
                    philly.scrollIntoView();
                    philly.click();
                    philly.querySelector('.mainText')?.click();
                    found = true;
                    break;
                }

                if (wrapper) {
                    wrapper.parentElement?.swiper?.slideNext();
                    wrapper.scrollBy(0, 150);
                }
                await new Promise(r => setTimeout(r, 500));
            }
        });

        console.log("Waiting for 'Chester, PA' header...");
        try {
            await page.waitForSelector('h2:has-text("Chester, PA")', { timeout: 15000 });
            console.log("Success! Philadelphia schedule active.");

            console.log("Scrolling...");
            await page.evaluate(async () => {
                const distance = 100;
                const delay = 100;
                while (document.documentElement.scrollTop + window.innerHeight < document.documentElement.scrollHeight) {
                    window.scrollBy(0, distance);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                window.scrollTo(0, 0);
                await new Promise(resolve => setTimeout(resolve, 500));
            });
            await page.waitForTimeout(1000);
        } catch (e) {
            console.log("Header not found, attempting extraction anyway...");
        }


        const matches = await page.evaluate(() => {
            const results = [];

            const container = document.querySelector('.css-1vszetx');
            if (!container) return results;

            const blocks = container.querySelectorAll('.css-1vmcr68');
            blocks.forEach(block => {
                const dateHeader = block.querySelector('h3.css-12otnha')?.innerText.trim() || "";
                
                const rows = block.querySelectorAll('.css-1r57kue, .css-s4g23d');
                rows.forEach(row => {
                    const time = row.querySelector('.gameTimeCol p')?.innerText.trim() || "TBA";
                    const league = row.querySelector('.leagueCol img')?.getAttribute('alt') || "";
                    
                    const team1 = row.querySelector('.css-oe234f')?.innerText.trim();
                    const team2 = row.querySelector('.css-kw84f0')?.innerText.trim();
                    const special = row.querySelector('.css-i8wd9l')?.innerText.trim();

                    if (team1 && team2) {
                        results.push({
                            title: `${team1} vs ${team2}`,
                            date: dateHeader,
                            time: time,
                            league: league
                        });
                    } else if (special) {
                        results.push({
                            title: special,
                            date: dateHeader,
                            time: time,
                            league: league
                        });
                    }
                });
            });
            return results;
        });


        for (const m of matches) {
            venueData.push({
                venue: 'Subaru Park',
                title: m.title,
                date: formatDatePPL(m.date),
                time: formatTimePPL(m.time),
                type: m.league.includes('WLL') ? 'WLL' : 'PLL'
            });
        }
        console.log(`Pulled ${venueData.length} matches.`);

        } catch (e) { console.log("Subaru Park PPL failed: ", e); }
    await page.close();
    await context.close();
    return venueData;
}

// DICKS SPORTING GOODS MAIN FUNCTION
// DICKS SPORTING GOODS MAIN FUNCTION
function categorizeDSG(title) {
    const text = title.toLowerCase();
    if (text.includes('rapids') && !text.includes(' 2')) return 'MLS';
    if (text.includes('rapids 2') || text.includes('mls next pro')) return 'MLS Next Pro';
    if (text.includes('national team') || text.includes('nwsl') || text.includes('women')) return 'NWSL';
    if (text.includes('concert') || text.includes('tour') || text.includes('phish')) return 'Concert';
    return 'Other';
}

async function scrapeDSG(browser) {
    const context = await browser.newContext();
    const page = await context.newPage();
    let venueData = [];

    console.log("🚀 Navigating to DSG Park Azure Portal...");
    
    try {
        await page.goto('https://dsgpark.azurewebsites.net/misc/upcoming-events', { 
            waitUntil: 'domcontentloaded', 
            timeout: 60000 
        });

        const closeBtn = page.locator('button:has(svg path[d*="M10.1583"])').first();
        try {
            await closeBtn.waitFor({ state: 'visible', timeout: 5000 });
            await closeBtn.click();
        } catch (e) {
            console.log("No DSG popup detected.");
        }

        await page.evaluate(async () => {
            const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            let lastHeight = document.body.scrollHeight;
            document.body.style.overflow = 'auto';
            for (let i = 0; i < 10; i++) {
                window.scrollTo(0, document.body.scrollHeight);
                await delay(1500); 
                let newHeight = document.body.scrollHeight;
                if (newHeight === lastHeight) break;
                lastHeight = newHeight;
            }
        });

        const rawEvents = await page.evaluate(() => {
            const events = [];
            const products = document.querySelectorAll('.product');
            products.forEach(item => {
                const titleLink = item.querySelector('h3 a.text-dark');
                const dateSpan = item.querySelector('span.text-gray-500.text-sm');
                if (titleLink && dateSpan) {
                    const fullText = dateSpan.innerText;
                    if (fullText.includes('•')) {
                        const parts = fullText.split('•').map(p => p.trim());
                        events.push({
                            title: titleLink.innerText.trim(),
                            rawDate: parts[1],
                            rawTime: parts[2]
                        });
                    }
                }
            });
            return events;
        });

        venueData = rawEvents.map(ev => ({
            venue: "Dick's Sporting Goods Park",
            title: ev.title.toUpperCase(),
            date: formatDate(ev.rawDate),
            time: formatTime(ev.rawTime),
            type: categorizeDSG(ev.title)
        }));

        console.log(`Success! DSG Park pulled ${venueData.length} events.`);

    } catch (err) {
        console.error("❌ DSG Error:", err.message);
    } finally {
        await page.close();
        await context.close();
    }
    return venueData;
}
// =======================================================================================

(async () => {
    const browser = await chromium.launch ({ headless: false });

    //run them one by one to keep memory clean
    const results = await Promise.all([
        scrapeBaylorConcert(browser),
        scrapeXfinityS(browser),
        scrapeXfinityE(browser),
        scrapeMizzouMB(browser),
        scrapeMizzouWB(browser),
        scrapeMizzouE(browser),
        scrapeProvidenceT(browser),
        scrapeProvidenceThorns(browser),
        scrapeShellDynamo(browser),
        scrapeShellDash(browser),
        scrapeSubaruUnion(browser),
        scrapeSubaruPPL(browser),
        scrapeDSG(browser)
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