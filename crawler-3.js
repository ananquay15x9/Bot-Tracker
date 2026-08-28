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

function cleanOpponent(rawTeam) {
    if (!rawTeam) return "Opponent TBD";
    return rawTeam
        .replace(/#\d+/g, '')
        .replace(/^(vs\.|at)/i, '')
        .replace(/\b(Wear Orange|Country Night|Alumni Night|Senior Night|Spring Break|90s Night|Preview Meet)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
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
async function scrapeBaylor(browser) {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 }
    });
    const page = await context.newPage();
    await setupTranscendKiller(page);

    const venueData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const seenEvents = new Set();

    try {
        console.log(`\n🚀 Scraping Baylor Foster Pavilion Schedule...`);
        // Navigate with list view parameter to expose every single event without FullCalendar +X more clipping
        await page.goto('https://baylorbears.com/calendar?view=list', { 
            waitUntil: 'domcontentloaded', 
            timeout: 35000 
        });

        await page.waitForTimeout(3000);

        // Fallback: If list view container is not present, iterate months in standard calendar
        const hasListView = await page.locator('.c-calendar-list, .sidearm-calendar-list, [data-test-id="s-game-card-standard__root"]').count() > 0;

        if (hasListView) {
            console.log("📋 List view active. Parsing all upcoming events...");
            const cards = await page.locator('[data-test-id="s-game-card-standard__root"], .c-calendar-list__item, .schedule-event-item').all();

            for (const card of cards) {
                try {
                    const cardText = await card.innerText();
                    if (!cardText.toLowerCase().includes('foster pavilion') && !cardText.toLowerCase().includes('waco')) {
                        continue;
                    }

                    const opponentLoc = card.locator('[data-test-id="s-game-card-standard__header-team-opponent-link"], .c-calendar-list__opponent, .opponent-name').first();
                    const opponent = (await opponentLoc.count() > 0) ? await opponentLoc.innerText() : "Opponent TBD";

                    const sportCodeLoc = card.locator('.mx-\\[4px\\], .c-calendar-list__sport, .sport-name').first();
                    const sportCode = (await sportCodeLoc.count() > 0) ? await sportCodeLoc.innerText() : "";

                    const dateLoc = card.locator('[data-test-id="s-game-card-standard__header-game-date"], [data-test-id="s-game-card-standard__header-game-date-details"], .c-calendar-list__date, .event-date').first();
                    const rawDate = (await dateLoc.count() > 0) ? await dateLoc.innerText() : "";

                    const timeLoc = card.locator('[aria-label="Event Time"], .c-calendar-list__time, .event-time').first();
                    let rawTime = "TBA";
                    if (await timeLoc.count() > 0) {
                        rawTime = await timeLoc.innerText();
                    }

                    const monthStr = rawDate.toLowerCase().substring(0, 3);
                    const year = getYearForMonth(monthStr);
                    const cleanDate = formatDate(`${rawDate} ${year}`);
                    const cleanTime = formatTime(rawTime);

                    if (cleanDate !== "TBA" && new Date(cleanDate) < today) continue;

                    let type = 'Other';
                    if (sportCode.includes('MBB') || cardText.includes('Men\'s Basketball')) type = 'NCAA MB';
                    else if (sportCode.includes('WBB') || cardText.includes('Women\'s Basketball')) type = 'NCAA WB';
                    else if (cardText.toLowerCase().includes('concert')) type = 'Concert';

                    const finalTitle = `BAYLOR VS. ${cleanOpponent(opponent).toUpperCase()}`;
                    const dedupeKey = `${cleanDate}-${finalTitle}`;

                    if (!seenEvents.has(dedupeKey)) {
                        seenEvents.add(dedupeKey);
                        venueData.push({
                            venue: 'Foster Pavilion',
                            title: finalTitle,
                            date: cleanDate,
                            time: cleanTime,
                            type: type
                        });
                        console.log(`✅ Kept: ${finalTitle} on ${cleanDate} (${cleanTime}) [${type}]`);
                    }
                } catch (err) { continue; }
            }
        }

        // Also query direct Men's and Women's Basketball schedules to guarantee 100% full coverage
        const directSchedules = [
            { url: 'https://baylorbears.com/sports/mens-basketball/schedule', type: 'NCAA MB' },
            { url: 'https://baylorbears.com/sports/womens-basketball/schedule', type: 'NCAA WB' }
        ];

        for (const sched of directSchedules) {
            try {
                await page.goto(sched.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForTimeout(2000);

                const gameRows = await page.locator('[data-test-id="s-game-card-standard__root"], .schedule-event-item').all();
                for (const row of gameRows) {
                    try {
                        const locText = await row.innerText();
                        if (!locText.toLowerCase().includes('foster pavilion') && !locText.toLowerCase().includes('waco')) {
                            continue;
                        }

                        const oppLoc = row.locator('[data-test-id="s-game-card-standard__header-team-opponent-link"], .schedule-default-event__opponent-name').first();
                        const opp = (await oppLoc.count() > 0) ? await oppLoc.innerText() : "";
                        if (!opp) continue;

                        const dLoc = row.locator('[data-test-id="s-game-card-standard__header-game-date"], .schedule-event-date__month-day').first();
                        const rawD = (await dLoc.count() > 0) ? await dLoc.innerText() : "";

                        const tLoc = row.locator('[aria-label="Event Time"], .schedule-event-item-result__label').first();
                        let rawT = "TBA";
                        if (await tLoc.count() > 0) {
                            const candidate = await tLoc.innerText();
                            const match = candidate.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/i);
                            if (match) rawT = match[0];
                        }

                        const mStr = rawD.toLowerCase().substring(0, 3);
                        const yr = getYearForMonth(mStr);
                        const cDate = formatDate(`${rawD} ${yr}`);
                        const cTime = formatTime(rawT);

                        if (cDate !== "TBA" && new Date(cDate) < today) continue;

                        const fTitle = `BAYLOR VS. ${cleanOpponent(opp).toUpperCase()}`;
                        const dKey = `${cDate}-${fTitle}`;

                        if (!seenEvents.has(dKey)) {
                            seenEvents.add(dKey);
                            venueData.push({
                                venue: 'Foster Pavilion',
                                title: fTitle,
                                date: cDate,
                                time: cTime,
                                type: sched.type
                            });
                            console.log(`✅ Kept: ${fTitle} on ${cDate} (${cTime}) [${sched.type}]`);
                        }
                    } catch (e) { continue; }
                }
            } catch (e) { continue; }
        }

    } catch (e) {
        console.log(`❌ Baylor failed: ${e.message}`);
    } finally {
        await page.close();
        await context.close();
    }

    return venueData;
}
// Xfinity Center - Sports
async function scrapeXfinityE(browser) {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 }
    });
    const page = await context.newPage();
    const venueData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        console.log(`\n🚀 Scraping Maryland Xfinity Center (Ticketmaster)...`);
        await page.goto('https://www.ticketmaster.com/xfinity-center-tickets-college-park/venue/172349', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Dismiss privacy / cookie banner if present
        try {
            const acceptBtn = page.getByRole('button', { name: 'Accept All' });
            if (await acceptBtn.isVisible({ timeout: 3000 })) await acceptBtn.click();
        } catch (e) {}

        // Wait for modern Ticketmaster containers
        await page.waitForSelector('a[data-testid="event-list-link"], div[class*="sc-eb703eab-0"], li[data-id]', { timeout: 15000 });

        // Expand Load More if available
        try {
            const loadMoreBtn = page.locator('button[data-testid="event-list-load-more"]');
            while (await loadMoreBtn.isVisible({ timeout: 2000 })) {
                await loadMoreBtn.scrollIntoViewIfNeeded();
                await loadMoreBtn.click();
                await page.waitForTimeout(1500);
            }
        } catch (e) {}

        const events = await page.evaluate(() => {
            const results = [];
            const items = document.querySelectorAll('li[data-id], div[class*="sc-eb703eab-0"]');

            items.forEach(item => {
                const titleEl = item.querySelector('span[class*="ufMKn"], [class*="EventName"]');
                let title = titleEl ? titleEl.innerText.trim() : "";

                const hiddenDateEl = item.querySelector('.VisuallyHidden-sc-8buqks-0 span');
                const dateRaw = hiddenDateEl ? hiddenDateEl.innerText.trim() : "";

                const timeEl = item.querySelector('span[class*="bZWmdt"] span, span[class*="fCBXcp"] .VisuallyHidden-sc-8buqks-0 span');
                const timeRaw = timeEl ? timeEl.innerText.trim() : "";

                if (!title) {
                    const fallbackLink = item.querySelector('a[data-testid="event-list-link"]');
                    if (fallbackLink) {
                        title = fallbackLink.innerText.split('\n')[0].trim();
                    }
                }

                if (title && (dateRaw || timeRaw)) {
                    results.push({ dateRaw, timeRaw, title });
                }
            });

            return results;
        });

        console.log(`📋 Found ${events.length} events at Xfinity Center. Processing...`);
        const seenEvents = new Set();

        for (const ev of events) {
            if (!ev.title) continue;

            const cleanTitle = ev.title.replace(/\s+/g, ' ').trim().toUpperCase();
            let type = 'Concert';
            const t = cleanTitle.toLowerCase();

            if (t.includes('mens basketball') || t.includes('mbb') || t.includes("men's basketball")) {
                type = 'NCAA MB';
            } else if (t.includes('womens basketball') || t.includes('wbb') || t.includes("women's basketball")) {
                type = 'NCAA WB';
            } else if (t.includes('volleyball')) {
                type = 'NCAA WVB';
            }

            const cleanDate = formatDate(ev.dateRaw);
            const timeMatch = ev.timeRaw.match(/\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)/i);
            const cleanTime = formatTime(timeMatch ? timeMatch[0] : (ev.timeRaw || 'TBA'));

            const dedupeKey = `${cleanDate}-${cleanTime}-${cleanTitle}`;
            if (seenEvents.has(dedupeKey)) continue;
            seenEvents.add(dedupeKey);

            if (cleanDate !== 'TBA' && new Date(cleanDate) < today) {
                continue;
            }

            venueData.push({
                venue: 'Xfinity Center',
                title: cleanTitle,
                date: cleanDate,
                time: cleanTime,
                type: type
            });

            console.log(`✅ Kept: ${cleanTitle} on ${cleanDate} (${cleanTime}) [${type}]`);
        }

    } catch (e) {
        console.log(`❌ Xfinity Center Events failed: ${e.message}`);
    } finally {
        await page.close();
        await context.close();
    }

    return venueData;
}

// MizzouMB main function
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
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 }
    });
    const page = await context.newPage();
    await setupTranscendKiller(page);

    const venueData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        console.log(`\n🚀 Scraping Mizzou Men's Basketball Schedule...`);
        await page.goto('https://mutigers.com/sports/mens-basketball/schedule/2026-27', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        const cardSelector = '.schedule-event-item__top, .schedule-event-item';
        await page.waitForSelector(cardSelector, { timeout: 15000 });

        const gameCards = await page.locator(cardSelector).all();
        console.log(`📋 Found ${gameCards.length} game cards. Filtering for Mizzou Arena home games...`);

        for (const card of gameCards) {
            try {
                // 1. VENUE & LOCATION CHECK
                const venueTypeLoc = card.locator('.schedule-event-date__venue-label').first();
                const venueNameLoc = card.locator('.schedule-event-item__venue, .schedule-default-event__venue').first();
                const locationLoc = card.locator('.schedule-event-item__location, .schedule-event-location').first();

                const venueType = (await venueTypeLoc.count() > 0) ? await venueTypeLoc.innerText() : "";
                const venueName = (await venueNameLoc.count() > 0) ? await venueNameLoc.innerText() : "";
                const locationText = (await locationLoc.count() > 0) ? await locationLoc.innerText() : "";
                const fullLocation = `${venueType} ${venueName} ${locationText}`.toUpperCase();

                const isMizzouArena = fullLocation.includes('MIZZOU ARENA') && fullLocation.includes('COLUMBIA');

                if (isMizzouArena) {
                    // 2. OPPONENT EXTRACTION
                    const opponentLoc = card.locator('.schedule-default-event__opponent-name').first();
                    let opponent = "";
                    if (await opponentLoc.count() > 0) {
                        opponent = await opponentLoc.innerText();
                    } else {
                        const fallbackNameLoc = card.locator('.schedule-default-event__name').first();
                        if (await fallbackNameLoc.count() > 0) opponent = await fallbackNameLoc.innerText();
                    }
                    if (!opponent) continue;

                    // 3. DATE EXTRACTION (Using dynamic academic year resolver)
                    const dateLoc = card.locator('.schedule-event-date__month-day').first();
                    let rawDate = "";
                    if (await dateLoc.count() > 0) {
                        rawDate = await dateLoc.innerText(); // e.g. "Nov 7"
                    }

                    const monthStr = rawDate.split(' ')[0].toLowerCase().substring(0, 3);
                    const yearStr = getYearForMonth(monthStr);
                    const cleanDate = formatDate(`${rawDate} ${yearStr}`);

                    // 4. TIME EXTRACTION
                    let rawTime = "TBA";
                    const timeLoc = card.locator('.schedule-event-item-result__label, .schedule-event-date__time').first();
                    if (await timeLoc.count() > 0) {
                        const candidateTime = await timeLoc.innerText();
                        const match = candidateTime.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/i);
                        if (match) {
                            rawTime = match[0];
                        }
                    }

                    const cleanTime = formatTime(rawTime);

                    // Skip past games
                    const eventDate = new Date(cleanDate);
                    if (cleanDate !== 'TBA' && eventDate < today) {
                        continue;
                    }

                    const finalTitle = `MISSOURI VS ${cleanOpponent(opponent).toUpperCase()}`;

                    venueData.push({
                        venue: 'Mizzou Arena',
                        title: finalTitle,
                        date: cleanDate,
                        time: cleanTime,
                        type: 'NCAA MB'
                    });

                    console.log(`✅ Kept: ${finalTitle} on ${cleanDate} (${cleanTime})`);
                }
            } catch (err) {
                console.log(`⚠️ Error processing Mizzou MBB card: ${err.message.substring(0, 45)}`);
            }
        }

    } catch (e) {
        console.log(`❌ Mizzou Arena Men's Basketball failed: ${e.message}`);
    } finally {
        await page.close();
        await context.close();
    }

    return venueData;
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
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 }
    });
    const page = await context.newPage();
    await setupTranscendKiller(page);

    const venueData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        console.log(`\n🚀 Scraping Mizzou Women's Basketball Schedule...`);
        await page.goto('https://mutigers.com/sports/womens-basketball/schedule', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        const cardSelector = '.schedule-event-item__top, .schedule-event-item';
        await page.waitForSelector(cardSelector, { timeout: 15000 });

        const gameCards = await page.locator(cardSelector).all();
        console.log(`📋 Found ${gameCards.length} game cards. Filtering for Mizzou Arena home games...`);

        for (const card of gameCards) {
            try {
                // 1. VENUE & LOCATION CHECK
                const venueTypeLoc = card.locator('.schedule-event-date__venue-label').first();
                const venueNameLoc = card.locator('.schedule-event-item__venue, .schedule-default-event__venue').first();
                const locationLoc = card.locator('.schedule-event-item__location, .schedule-event-location').first();

                const venueType = (await venueTypeLoc.count() > 0) ? await venueTypeLoc.innerText() : "";
                const venueName = (await venueNameLoc.count() > 0) ? await venueNameLoc.innerText() : "";
                const locationText = (await locationLoc.count() > 0) ? await locationLoc.innerText() : "";
                const fullLocation = `${venueType} ${venueName} ${locationText}`.toUpperCase();

                const isMizzouArena = fullLocation.includes('MIZZOU ARENA') && fullLocation.includes('COLUMBIA');

                if (isMizzouArena) {
                    // 2. OPPONENT EXTRACTION
                    const opponentLoc = card.locator('.schedule-default-event__opponent-name').first();
                    let opponent = "";
                    if (await opponentLoc.count() > 0) {
                        opponent = await opponentLoc.innerText();
                    } else {
                        const fallbackNameLoc = card.locator('.schedule-default-event__name').first();
                        if (await fallbackNameLoc.count() > 0) opponent = await fallbackNameLoc.innerText();
                    }
                    if (!opponent) continue;

                    // 3. DATE EXTRACTION (Using dynamic academic year resolver)
                    const dateLoc = card.locator('.schedule-event-date__month-day').first();
                    let rawDate = "";
                    if (await dateLoc.count() > 0) {
                        rawDate = await dateLoc.innerText(); // e.g. "Oct 28"
                    }

                    const monthStr = rawDate.split(' ')[0].toLowerCase().substring(0, 3);
                    const yearStr = getYearForMonth(monthStr);
                    const cleanDate = formatDate(`${rawDate} ${yearStr}`);

                    // 4. TIME EXTRACTION (Isolates valid time strings and ignores scores like "L 84-90")
                    let rawTime = "TBA";
                    const timeLoc = card.locator('.schedule-event-item-result__label, .schedule-event-date__time').first();
                    if (await timeLoc.count() > 0) {
                        const candidateTime = await timeLoc.innerText();
                        const match = candidateTime.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/i);
                        if (match) {
                            rawTime = match[0];
                        }
                    }

                    const cleanTime = formatTime(rawTime);

                    // Skip past games
                    const eventDate = new Date(cleanDate);
                    if (cleanDate !== 'TBA' && eventDate < today) {
                        continue;
                    }

                    const finalTitle = `MISSOURI VS ${cleanOpponent(opponent).toUpperCase()}`;

                    venueData.push({
                        venue: 'Mizzou Arena',
                        title: finalTitle,
                        date: cleanDate,
                        time: cleanTime,
                        type: 'NCAA WB'
                    });

                    console.log(`✅ Kept: ${finalTitle} on ${cleanDate} (${cleanTime})`);
                }
            } catch (err) {
                console.log(`⚠️ Error processing Mizzou WBB card: ${err.message.substring(0, 45)}`);
            }
        }

    } catch (e) {
        console.log(`❌ Mizzou Arena Women's Basketball failed: ${e.message}`);
    } finally {
        await page.close();
        await context.close();
    }

    return venueData;
}

// MIZZOU ARENA EVENTS MAIN FUNCTION
function categorizeMizzouArena(title) {
    const t = (title || "").toLowerCase();
    if (t.includes('mens basketball') || t.includes('mbb') || t.includes("men's basketball")) {
        return 'NCAA MB';
    }
    if (t.includes('womens basketball') || t.includes('wbb') || t.includes("women's basketball")) {
        return 'NCAA WB';
    }
    if (t.includes('volleyball')) {
        return 'NCAA WVB';
    }
    return 'Concert';
}

async function scrapeMizzouE(browser) {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 }
    });
    const page = await context.newPage();
    const venueData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        console.log(`\n🚀 Scraping Mizzou Arena (Ticketmaster)...`);
        await page.goto('https://www.ticketmaster.com/mizzou-arena-tickets-columbia/venue/50091', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Dismiss privacy / cookie banner if present
        try { 
            const acceptBtn = page.getByRole('button', { name: 'Accept All' });
            if (await acceptBtn.isVisible({ timeout: 3000 })) await acceptBtn.click();
        } catch (e) {}

        // Wait for event cards to load
        await page.waitForSelector('a[data-testid="event-list-link"], div[class*="sc-eb703eab-0"], li[data-id]', { timeout: 15000 });

        // Handle "Load More" pagination if present
        try {
            const loadMoreBtn = page.locator('button[data-testid="event-list-load-more"]');
            while (await loadMoreBtn.isVisible({ timeout: 2000 })) {
                await loadMoreBtn.scrollIntoViewIfNeeded();
                await loadMoreBtn.click();
                await page.waitForTimeout(1500);
            }
        } catch (e) {}

        const events = await page.evaluate(() => {
            const results = [];
            const items = document.querySelectorAll('li[data-id], div[class*="sc-eb703eab-0"]');

            items.forEach(item => {
                const titleEl = item.querySelector('span[class*="ufMKn"], [class*="EventName"]');
                let title = titleEl ? titleEl.innerText.trim() : "";

                const hiddenDateEl = item.querySelector('.VisuallyHidden-sc-8buqks-0 span');
                const dateRaw = hiddenDateEl ? hiddenDateEl.innerText.trim() : "";

                const timeEl = item.querySelector('span[class*="bZWmdt"] span, span[class*="fCBXcp"] .VisuallyHidden-sc-8buqks-0 span');
                const timeRaw = timeEl ? timeEl.innerText.trim() : "";

                if (!title) {
                    const fallbackLink = item.querySelector('a[data-testid="event-list-link"]');
                    if (fallbackLink) {
                        title = fallbackLink.innerText.split('\n')[0].trim();
                    }
                }

                if (title && (dateRaw || timeRaw)) {
                    results.push({ dateRaw, timeRaw, title });
                }
            });

            return results;
        });

        console.log(`📋 Found ${events.length} Mizzou Arena items on Ticketmaster. Processing...`);
        const seenEvents = new Set();

        for (const ev of events) {
            if (!ev.title) continue;

            const cleanTitle = ev.title.replace(/\s+/g, ' ').trim().toUpperCase();
            const cleanDate = formatDate(ev.dateRaw);
            const cleanTime = formatTime(ev.timeRaw);
            const eventType = categorizeMizzouArena(cleanTitle);

            // Deduplication guard
            const dedupeKey = `${cleanDate}-${cleanTime}-${cleanTitle}`;
            if (seenEvents.has(dedupeKey)) continue;
            seenEvents.add(dedupeKey);

            // Filter past events
            if (cleanDate !== 'TBA' && new Date(cleanDate) < today) {
                continue;
            }

            venueData.push({
                venue: 'Mizzou Arena',
                title: cleanTitle,
                date: cleanDate,
                time: cleanTime,
                type: eventType
            });

            console.log(`✅ Kept: ${cleanTitle} on ${cleanDate} (${cleanTime}) [${eventType}]`);
        }

    } catch (e) {
        console.log(`❌ Mizzou Arena Events failed: ${e.message}`);
    } finally {
        await page.close();
        await context.close();
    }

    return venueData;
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
        await context.close();
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
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 }
    });
    const page = await context.newPage();
    const venueDataPThorns = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        console.log(`\n🚀 Scraping Portland Thorns Schedule (Providence Park)...`);
        await page.goto('https://www.thorns.com/schedule', { 
            waitUntil: 'domcontentloaded',
            timeout: 30000 
        });

        // Bypass OneTrust cookie banner if visible
        try {
            const cookieBtn = page.locator('#onetrust-accept-btn-handler');
            if (await cookieBtn.isVisible({ timeout: 4000 })) {
                await cookieBtn.click();
            }
        } catch (e) {}

        // Scroll to load all Webflow dynamic collection items
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 300;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });
        await page.waitForTimeout(1500);

        // Extract match details directly from Webflow collection items
        const rawMatches = await page.evaluate(() => {
            const results = [];
            const items = document.querySelectorAll('.schedule-collection-item, .match-row');

            items.forEach(card => {
                // 1. Location check
                const locationRow = card.querySelector('.match-detail-row.location');
                const locationText = locationRow ? locationRow.innerText.toUpperCase() : "";

                const isHome = locationText.includes('PROVIDENCE PARK') || 
                               (locationText.includes('PORTLAND, OR') && !locationText.includes('HARRISON'));

                if (!isHome) return;

                // 2. Teams extraction
                const teamHeaders = Array.from(card.querySelectorAll('.teams-names .team h4, .teams-names h4'))
                    .map(h => h.innerText.trim());

                let homeTeam = "Thorns";
                let awayTeam = "Opponent TBD";

                if (teamHeaders.length >= 2) {
                    homeTeam = teamHeaders[0];
                    awayTeam = teamHeaders[1];
                } else if (teamHeaders.length === 1) {
                    awayTeam = teamHeaders[0];
                }

                // 3. Date & time extraction
                const dateRow = card.querySelector('.match-detail-row.date:not(.header)');
                let rawDate = "";
                let rawTime = "TBA";

                if (dateRow) {
                    const pTags = Array.from(dateRow.querySelectorAll('p'))
                        .map(p => p.innerText.trim())
                        .filter(txt => txt && txt !== '|');
                    
                    if (pTags.length >= 1) rawDate = pTags[0]; // e.g. "Sep 13"
                    if (pTags.length >= 2) rawTime = pTags[1]; // e.g. "4:00 pm"
                }

                if (rawDate) {
                    results.push({
                        homeTeam,
                        awayTeam,
                        rawDate,
                        rawTime
                    });
                }
            });

            return results;
        });

        console.log(`📋 Discovered ${rawMatches.length} raw home matches. Normalizing...`);
        const seenMatches = new Set();

        for (const m of rawMatches) {
            const cleanDate = formatDate(m.rawDate);
            const cleanTime = formatTime(m.rawTime);

            const title = `PORTLAND THORNS FC VS. ${m.awayTeam.toUpperCase()}`;
            const dedupeKey = `${cleanDate}-${title}`;

            if (seenMatches.has(dedupeKey)) continue;
            seenMatches.add(dedupeKey);

            // Skip past matches
            if (cleanDate !== 'TBA' && new Date(cleanDate) < today) {
                continue;
            }

            venueDataPThorns.push({
                venue: 'Providence Park',
                title: title,
                date: cleanDate,
                time: cleanTime,
                type: 'NWSL'
            });

            console.log(`✅ Kept: ${title} on ${cleanDate} (${cleanTime}) [NWSL]`);
        }

    } catch (err) {
        console.error("❌ Providence Park Thorns Failed:", err.message);
    } finally {
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

async function scrapeSubaruUnion(browser) {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 }
    });
    const page = await context.newPage();
    const venueData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString().split('T')[0];

    try {
        console.log(`\n🚀 Scraping Subaru Park Philadelphia Union (Anchored to ${todayISO})...`);
        await page.goto(`https://www.philadelphiaunion.com/schedule/#competition=all&date=${todayISO}`, { 
            waitUntil: 'domcontentloaded',
            timeout: 30000 
        });

        // Dismiss marketing and cookie popups
        try {
            const closePopup = page.locator('#closeIconContainer, [data-testid="closeIcon"], button[aria-label="Close"]').first();
            if (await closePopup.isVisible({ timeout: 4000 })) {
                await closePopup.click();
            }
        } catch (e) {}

        try {
            const cookieBtn = page.locator('#onetrust-accept-btn-handler');
            if (await cookieBtn.isVisible({ timeout: 4000 })) {
                await cookieBtn.click();
            }
        } catch (e) {}

        await page.waitForSelector('.mls-c-match-list__match, .mls-c-match-tile', { timeout: 15000 });
        await page.waitForTimeout(2000);

        const rawMatches = await page.evaluate(() => {
            const results = [];
            const matchCards = document.querySelectorAll('.mls-c-match-list__match');

            matchCards.forEach(row => {
                const matchLink = row.querySelector('a[href*="/matches/"]');
                const href = matchLink ? matchLink.href : "";

                let urlDate = "";
                const urlDateMatch = href.match(/(\d{2})-(\d{2})-(\d{4})/);
                if (urlDateMatch) {
                    const month = urlDateMatch[1];
                    const day = urlDateMatch[2];
                    const year = urlDateMatch[3];
                    urlDate = `${year}-${month}-${day}`;
                }

                const statusText = row.querySelector('.mls-c-status-stamp__status')?.innerText.trim() || "";
                const home = row.querySelector('.--home .mls-c-club__shortname, .--home .mls-c-club__name')?.innerText.trim() || "Philadelphia";
                const away = row.querySelector('.--away .mls-c-club__shortname, .--away .mls-c-club__name')?.innerText.trim() || "Opponent TBD";

                const timeEl = row.querySelector('.mls-c-scorebug span, [class*="scorebug"] span');
                const time = timeEl ? timeEl.innerText.trim() : "TBA";

                const infoParagraphs = row.querySelectorAll('.mls-c-match-list__match-info p');
                let competition = "";
                let venue = "";

                if (infoParagraphs.length > 0) {
                    competition = infoParagraphs[0].innerText.trim();
                    venue = infoParagraphs[infoParagraphs.length - 1].innerText.trim();
                }

                if (href) {
                    results.push({
                        urlDate,
                        statusText,
                        home,
                        away,
                        time,
                        competition,
                        venue
                    });
                }
            });

            return results;
        });

        console.log(`📋 Found ${rawMatches.length} total fixtures on Union schedule.`);
        const seenMatches = new Set();

        for (const m of rawMatches) {
            const venueLower = m.venue.toLowerCase();
            const isSubaruPark = venueLower.includes('subaru park') || 
                                 (m.home.toLowerCase().includes('philadelphia') && !venueLower.includes('stadium') && !venueLower.includes('field'));

            if (!isSubaruPark) continue;

            let cleanDate = m.urlDate;
            if (!cleanDate && m.statusText.includes('/')) {
                cleanDate = formatDate(m.statusText);
            }

            const cleanTime = formatTime(m.time);

            if (cleanDate && cleanDate !== 'TBA' && new Date(cleanDate) < today) {
                continue;
            }

            let type = 'Other';
            const comp = m.competition.toLowerCase();
            if (comp.includes('mls regular season') || comp.includes('mls') || comp.includes('leagues cup') || comp.includes('us open cup')) {
                type = 'MLS';
            } else if (comp.includes('next pro') || comp.includes('union ii')) {
                type = 'MLS Next Pro';
            } else if (comp.includes('concert') || comp.includes('tour')) {
                type = 'Concert';
            }

            const title = `${m.home.toUpperCase()} VS. ${m.away.toUpperCase()}`;
            const dedupeKey = `${cleanDate}-${cleanTime}-${title}`;

            if (seenMatches.has(dedupeKey)) continue;
            seenMatches.add(dedupeKey);

            venueData.push({
                venue: 'Subaru Park',
                title: title,
                date: cleanDate || 'TBA',
                time: cleanTime,
                type: type
            });

            console.log(`✅ Kept: ${title} on ${cleanDate} (${cleanTime}) [${type}]`);
        }

    } catch (err) {
        console.error("❌ Subaru Park Union Failed:", err.message);
    } finally {
        await page.close();
        await context.close();
    }

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

async function scrapeSubaruPPL(browser) {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 }
    });
    const page = await context.newPage();
    const venueData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        console.log(`\n🚀 Scraping Subaru Park PLL Schedule...`);
        await page.goto('https://premierlacrosseleague.com/schedule', { 
            waitUntil: 'domcontentloaded', 
            timeout: 45000 
        });

        // Dismiss cookies
        try {
            const acceptBtn = page.locator('#onetrust-accept-btn-handler, button:has-text("Accept All"), button:has-text("Accept")').first();
            if (await acceptBtn.isVisible({ timeout: 4000 })) {
                await acceptBtn.click();
            }
        } catch (e) {}

        await page.waitForTimeout(2000);

        // Click Philadelphia in MUI sidebar using evaluate to avoid detached DOM race conditions
        console.log("📍 Selecting Philadelphia, PA in sidebar...");
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
            const philly = buttons.find(b => b.innerText.includes("Philadelphia, PA"));
            if (philly) {
                philly.click();
            }
        });

        await page.waitForTimeout(2500);

        // Extract games directly from the active weekend panel
        const rawGames = await page.evaluate(() => {
            const results = [];
            const dateBlocks = document.querySelectorAll('div[class*="mui-npzdg3"], div:has(> div > div > h3)');

            dateBlocks.forEach(block => {
                const h3El = block.querySelector('h3, [class*="mui-1p3y7qo"]');
                const dateHeader = h3El ? h3El.innerText.trim() : "";

                const rows = block.querySelectorAll('.mui-1lbahml, [class*="mui-1ys4s5z"] > div, div:has(.gameTimeCol)');

                rows.forEach(row => {
                    const timeEl = row.querySelector('.gameTimeCol p, [class*="gameTimeCol"]');
                    const rawTime = timeEl ? timeEl.innerText.trim() : "TBA";

                    const teamLinks = Array.from(row.querySelectorAll('a[aria-label*="team"], a[href*="/teams/"]'));
                    let t1 = "";
                    let t2 = "";

                    if (teamLinks.length >= 2) {
                        t1 = teamLinks[0].innerText.replace(/\n+/g, ' ').trim();
                        t2 = teamLinks[1].innerText.replace(/\n+/g, ' ').trim();
                    } else {
                        const pTeams = Array.from(row.querySelectorAll('.mui-19x1jxo, .mui-8r8wtf, [class*="mui-"] p'));
                        if (pTeams.length >= 4) {
                            t1 = `${pTeams[0].innerText} ${pTeams[1].innerText}`.trim();
                            t2 = `${pTeams[2].innerText} ${pTeams[3].innerText}`.trim();
                        }
                    }

                    let league = "PLL";
                    const leagueImg = row.querySelector('.leagueCol img');
                    if (leagueImg && leagueImg.alt && leagueImg.alt.toUpperCase().includes('WLL')) {
                        league = "WLL";
                    }

                    if (t1 && t2) {
                        results.push({
                            title: `${t1.toUpperCase()} VS. ${t2.toUpperCase()}`,
                            dateStr: dateHeader,
                            timeStr: rawTime,
                            league: league
                        });
                    }
                });
            });

            return results;
        });

        console.log(`📋 Found ${rawGames.length} scheduled matches in Philadelphia weekend.`);
        const seenMatches = new Set();

        for (const g of rawGames) {
            const cleanDate = formatDate(g.dateStr);
            const cleanTime = formatTime(g.timeStr);
            const dedupeKey = `${cleanDate}-${cleanTime}-${g.title}`;

            if (seenMatches.has(dedupeKey)) continue;
            seenMatches.add(dedupeKey);

            if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
                const match = g.dateStr.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})/i);
                if (match) {
                    cleanDate = formatDate(`${match[0]} 2026`);
                } else {
                    cleanDate = '2026-08-29'; // Subaru Park PLL Championship / Quarterfinals weekend fallback
                }
            }

            venueData.push({
                venue: 'Subaru Park',
                title: g.title,
                date: cleanDate,
                time: cleanTime,
                type: g.league
            });

            console.log(`✅ Kept: ${g.title} on ${cleanDate} (${cleanTime}) [${g.league}]`);
        }

    } catch (err) {
        console.error("❌ Subaru Park PLL Failed:", err.message);
    } finally {
        await page.close();
        await context.close();
    }

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
        scrapeBaylor(browser),
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
        scrapeDSG(browser),
    ]);

    // flatten the array
    const allData = results.flat();allData

    const uniqueData = [];
    const seenGlobal = new Set();

    for (const item of allData) {
    const key = `${item.venue}|${item.title}|${item.date}`;
    if (!seenGlobal.has(key)) {
        seenGlobal.add(key);
        uniqueData.push(item);
    }
}

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