const { chromium } = require('playwright');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

//========================================
const MONTH_NUMBERS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const THIS_YEAR = new Date().getFullYear();
const NEXT_YEAR_NUM = THIS_YEAR + 1;

function currentSeasonStart(now = new Date()) {
    return (now.getMonth() + 1) >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}

function seasonYearFor(month, day = 1, now = new Date()) {
    month = Number(month);
    if (!(month >= 1 && month <= 12)) return now.getFullYear();
    const start = currentSeasonStart(now);
    if (month >= 8) return start;       // Aug - Dec
    if (month <= 6) return start + 1;   // Jan - Jun
    // July: the nearest one ahead (this year's up to and including July itself, otherwise next year's)
    return (now.getMonth() + 1) >= 8 ? now.getFullYear() + 1 : now.getFullYear();
}

function yearForText(text, now = new Date()) {
    const m = String(text || '').match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{1,2})?/i);
    if (!m) return now.getFullYear();
    return seasonYearFor(MONTH_NUMBERS[m[1].toLowerCase()], m[2] ? parseInt(m[2], 10) : 1, now);
}

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
    const match = dateStr.match(/([A-Za-z]+)\.?\s+(\d+)(?:,?\s+(\d{4}))?/);
    if (match) {
        const month = monthMap[match[1].toLowerCase().substring(0, 3)];
        const day = match[2].padStart(2, '0');
        const year = match[3] || seasonYearFor(parseInt(month, 10), parseInt(day, 10));

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
    if (currentMonth >= 7) {
        return { firstHalf: currentYear, secondHalf: currentYear + 1 };
    } else {
        return { firstHalf: currentYear - 1, secondHalf: currentYear };
    }
}

// Determine which year a month falls into based on academic calendar
function getYearForMonth(monthStr) {
    const academicYear = getAcademicYear();
    // Aug-Dec are in the first half of the season year (it starts July 1); Jan-Jul are in the second half
    if (['aug', 'sep', 'oct', 'nov', 'dec'].includes(monthStr)) {
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

// Format time for Xfinity
function formatTimeXfinity(timeStr) {
    if (!timeStr || timeStr === 'TBA' || timeStr.toUpperCase() === '12:00AM' || timeStr.toUpperCase() === '12:00 AM') {
        return 'TBA';
    }

    let cleaned = timeStr.toUpperCase().replace(/\./g, '').replace(/ET|CT|PT|MT|EDT|CDT/g, '').trim();
    const match = cleaned.match(/(\d{1,2}(?::\d{2})?)\s*(AM|PM)/i);

    if (match) {
        let timePart = match[1];
        let ampm = match[2].toUpperCase();

        if (!timePart.includes(':')) {
            timePart += ':00';
        }

        return `${timePart}${ampm}`;
    }

    return 'TBA';
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
        // no year on the page: work it out from today (a range such as "Dec 30 - Jan 2" runs into the next year)
        const baseYear = seasonYearFor(startMonth, startDay);
        let startYear = isGoHeels ? getYearForMonth(startMonthStr) : baseYear;
        let endYear = isGoHeels ? getYearForMonth(endMonthStr) : (endMonth < startMonth ? baseYear + 1 : baseYear);

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


function toTitleCase(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function cleanOpponent(rawTeam) {
    if (!rawTeam) return "Opponent TBD";
    let clean = rawTeam
        .replace(/#\d+/g, '')
        .replace(/^(vs\.|at)/i, '')
        .replace(/\b(Wear Orange|Country Night|Alumni Night|Senior Night|Spring Break|90s Night|Preview Meet|Season Opener|One Night Only)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    return toTitleCase(clean);
}

function formatFosterTime(rawTime) {
    if (!rawTime || rawTime.toUpperCase().includes('TBA')) return 'TBA';
    let clean = rawTime.replace(/\./g, '').trim(); // "6 pm CT"
    const match = clean.match(/(\d{1,2}(?::\d{2})?)\s*(am|pm)(?:\s*(ct|cst|et|est))?/i);
    if (match) {
        let t = match[1];
        let ampm = match[2].toUpperCase();
        let tz = match[3] ? ` ${match[3].toUpperCase()}` : ' CT';
        if (!t.includes(':')) t += ':00';
        return `${t}${ampm}${tz}`;
    }
    return clean;
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

    // Query direct Men's and Women's Basketball schedules to guarantee 100% full coverage
    const directSchedules = [
        { 
            url: 'https://baylorbears.com/sports/mens-basketball/schedule', 
            type: 'NCAA MB', 
            teamPrefix: 'Baylor Bears' 
        },
        { 
            url: 'https://baylorbears.com/sports/womens-basketball/schedule', 
            type: 'NCAA WB', 
            teamPrefix: 'Baylor Lady Bears' 
        }
    ];

    for (const sched of directSchedules) {
        try {
            console.log(`\n🐻 Scraping Baylor (${sched.teamPrefix})...`);
            await page.goto(sched.url, { waitUntil: 'domcontentloaded', timeout: 35000 });
            await page.waitForTimeout(2000);

            await page.waitForSelector('[data-test-id="s-game-card-standard__root"], .schedule-event-item', { timeout: 15000 }).catch(() => {});

            const rawGames = await page.evaluate(() => {
                const results = [];
                const cards = document.querySelectorAll('[data-test-id="s-game-card-standard__root"], .schedule-event-item');

                cards.forEach(card => {
                    const fullText = card.innerText || "";
                    if (!fullText.toLowerCase().includes('foster pavilion') && !fullText.toLowerCase().includes('waco')) {
                        return;
                    }

                    // Opponent
                    const oppEl = card.querySelector('[data-test-id="s-game-card-standard__header-team-opponent-link"], .schedule-default-event__opponent-name');
                    const opponent = oppEl ? oppEl.innerText.trim() : "";

                    // Date: check both modern header date and legacy Sidearm tag
                    const dateEl = card.querySelector('[data-test-id="s-game-card-standard__header-game-date"], .schedule-event-date__month-day, [data-test-id="s-game-card-standard__header-game-date-details"]');
                    const rawDate = dateEl ? dateEl.innerText.trim() : "";

                    // Time: check aria-label="Event Time" or result label
                    const timeEl = card.querySelector('[aria-label="Event Time"], .schedule-event-item-result__label');
                    const rawTime = timeEl ? timeEl.innerText.trim() : "TBA";

                    if (opponent && rawDate) {
                        results.push({ opponent, rawDate, rawTime });
                    }
                });
                return results;
            });

            console.log(`📋 Found ${rawGames.length} ${sched.teamPrefix} home games at Foster Pavilion.`);

            for (const game of rawGames) {
                // Parse date cleanly (e.g. "Nov 2 (Mon)" -> "Nov 2")
                let cleanMonthDay = game.rawDate.replace(/\(.*\)/g, '').trim();
                const monthStr = cleanMonthDay.split(' ')[0].toLowerCase().substring(0, 3);
                const yr = getYearForMonth(monthStr);
                const cleanDate = formatDate(`${cleanMonthDay} ${yr}`);

                const cleanTime = formatFosterTime(game.rawTime);

                if (cleanDate !== "TBA" && new Date(cleanDate) < today) continue;

                const cleanOpp = cleanOpponent(game.opponent);
                const finalTitle = `${sched.teamPrefix} vs. ${cleanOpp}`;
                const dedupeKey = `${cleanDate}-${cleanTime}-${finalTitle}`;

                if (seenEvents.has(dedupeKey)) continue;
                seenEvents.add(dedupeKey);

                venueData.push({
                    venue: 'Foster Pavilion',
                    title: finalTitle,
                    date: cleanDate,
                    time: cleanTime,
                    type: sched.type
                });

                console.log(`✅ Kept: ${finalTitle} on ${cleanDate} (${cleanTime}) [${sched.type}]`);
            }
        } catch (e) {
            console.log(`❌ Error scraping ${sched.teamPrefix}: ${e.message}`);
        }
    }

    await page.close();
    await context.close();
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

        try {
            const acceptBtn = page.getByRole('button', { name: 'Accept All' });
            if (await acceptBtn.isVisible({ timeout: 3000 })) await acceptBtn.click();
        } catch (e) {}

        await page.waitForSelector('li[data-id], div[class*="sc-451c8dd0-2"], div[class*="sc-eb703eab-0"]', { timeout: 15000 });

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
            const items = document.querySelectorAll('li[data-id], div[class*="sc-451c8dd0-2"], div[class*="sc-eb703eab-0"]');

            items.forEach(item => {
                // 1. EXTRACT TITLE
                let title = "";
                const directTitle = item.querySelector('[class*="eMziwB"], [class*="hzNfZR"] span');
                if (directTitle) {
                    title = directTitle.innerText.trim();
                }

                if (!title || title.toLowerCase() === 'find tickets') {
                    const hiddenTextEl = item.querySelector('button[aria-controls="eventOverflow"] .VisuallyHidden-sc-8buqks-0, a[data-testid="event-list-link"] .VisuallyHidden-sc-8buqks-0');
                    if (hiddenTextEl) {
                        const rawHidden = hiddenTextEl.innerText;
                        title = rawHidden.split(',')[0].replace(/Open additional information for/i, '').trim();
                    }
                }

                if (!title || title.toLowerCase() === 'find tickets') {
                    const legacyTitle = item.querySelector('span[class*="ufMKn"], [class*="EventName"]');
                    if (legacyTitle) {
                        title = legacyTitle.innerText.trim();
                    }
                }

                if (!title || title.toLowerCase() === 'find tickets') return;

                // 2. EXTRACT DATE & TIME WITHOUT VOLATILE CSS HASHES
                const hiddenSpans = Array.from(
                    item.querySelectorAll('.VisuallyHidden-sc-8buqks-0 span, [class*="VisuallyHidden"] span')
                ).map(el => el.innerText.trim()).filter(Boolean);

                const dateRaw = hiddenSpans.length > 0 ? hiddenSpans[0] : "";

                // Check remaining hidden spans and visible row text for time
                const candidateTimeText = [
                    ...hiddenSpans.slice(1),
                    item.innerText || ""
                ].join(" ");

                const timeMatch = candidateTimeText.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM))\b/i);
                let timeRaw = "TBA";
                if (timeMatch) {
                    const matched = timeMatch[1].replace(/\s+/g, '').toUpperCase();
                    // Ticketmaster uses 12:00AM when the game time is unannounced/TBA
                    if (matched !== '12:00AM' && matched !== '00:00AM') {
                        timeRaw = matched.replace(/^0/, ''); // "01:00PM" -> "1:00PM"
                    }
                }

                if (dateRaw) {
                    results.push({ dateRaw, timeRaw, title });
                }
            });

            return results;
        });

        console.log(`📋 Found ${events.length} events at Xfinity Center. Processing...`);
        const seenEvents = new Set();

        for (const ev of events) {
            if (!ev.title) continue;

            const cleanTitle = toTitleCase(ev.title.replace(/\s+/g, ' ').trim());
            const t = cleanTitle.toLowerCase();
            let type = 'Concert';

            if (t.includes('womens basketball') || t.includes('women basketball') || t.includes('wbb') || t.includes("women's basketball")) {
                type = 'NCAA WB';
            } else if (t.includes('mens basketball') || t.includes('men basketball') || t.includes('mbb') || t.includes("men's basketball")) {
                type = 'NCAA MB';
            } else if (t.includes('volleyball') || t.includes('wvb')) {
                type = 'NCAA WVB';
            }

            const cleanDate = formatDate(ev.dateRaw);
            const cleanTime = ev.timeRaw === 'TBA' ? 'TBA' : formatTime(ev.timeRaw);

            const dedupeKey = `${cleanDate}-${cleanTime}-${cleanTitle}`;
            if (seenEvents.has(dedupeKey)) continue;
            seenEvents.add(dedupeKey);

            if (cleanDate !== 'TBA' && new Date(cleanDate) < today) {
                continue;
            }

            venueData.push({
                venue: 'Maryland - Xfinity Center',
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

// MIZZOU ARENA MEN BASKETBALL MAIN FUNCTION
async function scrapeMizzouMB(browser) {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 }
    });
    const page = await context.newPage();
    await setupTranscendKillerMizzouMB(page);

    const venueData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const seenMBB = new Set();

    try {
        console.log(`\n🚀 Scraping Mizzou Men's Basketball Schedule...`);
        await page.goto(`https://mutigers.com/sports/mens-basketball/schedule/season/${currentSeasonStart()}-${String(currentSeasonStart() + 1).slice(2)}`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        const cardSelector = '.schedule-event-item__top, .schedule-event-item';
        await page.waitForSelector(cardSelector, { timeout: 15000 });

        const gameCards = await page.locator(cardSelector).all();
        console.log(`📋 Found ${gameCards.length} game cards. Filtering for Mizzou Arena home games...`);

        for (const card of gameCards) {
            try {
                // 1. VENUE & LOCATION CHECK (Strictly Mizzou Arena in Columbia, Mo.)
                const cardText = await card.innerText();
                const isHome = cardText.toUpperCase().includes('MIZZOU ARENA') && cardText.toUpperCase().includes('COLUMBIA');

                if (!isHome) continue;

                // 2. OPPONENT EXTRACTION
                const opponentLoc = card.locator('.schedule-default-event__opponent-name, .schedule-default-event__name').first();
                let opponent = (await opponentLoc.count() > 0) ? await opponentLoc.innerText() : "";
                if (!opponent) continue;

                // 3. ACCURATE DATE & ISO TIME EXTRACTION (Using datetime attribute on <time>)
                let cleanDate = "TBA";
                let dtAttr = "";
                const timeTag = card.locator('time[datetime]').first();
                if (await timeTag.count() > 0) {
                    dtAttr = (await timeTag.getAttribute('datetime')) || "";
                    if (dtAttr) cleanDate = dtAttr.split('T')[0];
                }

                // Fallback to text day if datetime attribute is missing
                if (cleanDate === "TBA") {
                    const dayLoc = card.locator('.schedule-event-date__day').first();
                    if (await dayLoc.count() > 0) {
                        const rawD = await dayLoc.innerText(); // e.g. "Nov 3"
                        const mStr = rawD.split(' ')[0].toLowerCase().substring(0, 3);
                        cleanDate = formatDate(`${rawD} ${getYearForMonth(mStr)}`);
                    }
                }

                // 4. TIME EXTRACTION
                // Target .schedule-event-item-result__label directly (do NOT combine with .schedule-event-date__time)
                let cleanTime = "TBA";
                const resultTimeLoc = card.locator('.schedule-event-item-result__label, .schedule-event-item-result strong').first();
                if (await resultTimeLoc.count() > 0) {
                    const rawTimeText = await resultTimeLoc.evaluate(el => el.textContent || '');
                    const match = rawTimeText.replace(/\./g, '').match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/i);
                    if (match) cleanTime = formatTime(match[1]);
                }

                // Fallback A: Parse directly from <time datetime="2026-11-03T19:00:00.000-06:00">
                if (cleanTime === "TBA" && dtAttr.includes('T')) {
                    const timePart = dtAttr.split('T')[1].substring(0, 5); // "19:00"
                    if (timePart && timePart !== "00:00") {
                        let [h, m] = timePart.split(':').map(Number);
                        const ampm = h >= 12 ? 'PM' : 'AM';
                        h = h % 12 || 12;
                        cleanTime = `${h}:${String(m).padStart(2, '0')}${ampm}`;
                    }
                }

                // Fallback B: Match against full card text
                if (cleanTime === "TBA") {
                    const fallbackMatch = cardText.replace(/\./g, '').match(/\b(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\b/i);
                    if (fallbackMatch) cleanTime = formatTime(fallbackMatch[1]);
                }

                // Skip past games
                if (cleanDate !== 'TBA' && new Date(cleanDate) < today) continue;

                const finalTitle = `Mizzou Men's Basketball VS ${cleanOpponent(opponent).toUpperCase()}`;
                const dedupeKey = `${cleanDate}-${finalTitle}`;

                if (seenMBB.has(dedupeKey)) continue;
                seenMBB.add(dedupeKey);

                venueData.push({
                    venue: 'Mizzou Arena',
                    title: finalTitle,
                    date: cleanDate,
                    time: cleanTime,
                    type: 'NCAA MB'
                });

                console.log(`✅ Kept: ${finalTitle} on ${cleanDate} (${cleanTime}) [NCAA MB]`);

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


// MIZZOU ARENA WOMEN BASKETBALL MAIN FUNCTION
async function scrapeMizzouWB(browser) {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 }
    });
    const page = await context.newPage();
    await setupTranscendKillerMWB(page);

    const venueData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const seenWBB = new Set();

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
                const cardText = await card.innerText();
                const isHome = cardText.toUpperCase().includes('MIZZOU ARENA') && cardText.toUpperCase().includes('COLUMBIA');

                if (!isHome) continue;

                // 2. OPPONENT EXTRACTION
                const opponentLoc = card.locator('.schedule-default-event__opponent-name, .schedule-default-event__name').first();
                let opponent = (await opponentLoc.count() > 0) ? await opponentLoc.innerText() : "";
                if (!opponent) continue;

                // 3. ACCURATE DATE & ISO TIME EXTRACTION (Using datetime attribute on <time>)
                let cleanDate = "TBA";
                let dtAttr = "";
                const timeTag = card.locator('time[datetime]').first();
                if (await timeTag.count() > 0) {
                    dtAttr = (await timeTag.getAttribute('datetime')) || "";
                    if (dtAttr) cleanDate = dtAttr.split('T')[0];
                }

                // Fallback to text day if datetime attribute is missing
                if (cleanDate === "TBA") {
                    const dayLoc = card.locator('.schedule-event-date__day').first();
                    if (await dayLoc.count() > 0) {
                        const rawD = await dayLoc.innerText(); // e.g. "Nov 2"
                        const mStr = rawD.split(' ')[0].toLowerCase().substring(0, 3);
                        cleanDate = formatDate(`${rawD} ${getYearForMonth(mStr)}`);
                    }
                }

                // 4. TIME EXTRACTION
                // Target .schedule-event-item-result__label directly (do NOT combine with .schedule-event-date__time)
                let cleanTime = "TBA";
                const resultTimeLoc = card.locator('.schedule-event-item-result__label, .schedule-event-item-result strong').first();
                if (await resultTimeLoc.count() > 0) {
                    const rawTimeText = await resultTimeLoc.evaluate(el => el.textContent || '');
                    const match = rawTimeText.replace(/\./g, '').match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/i);
                    if (match) cleanTime = formatTime(match[1]);
                }

                // Fallback A: Parse directly from <time datetime="2026-11-02T18:30:00.000-06:00">
                if (cleanTime === "TBA" && dtAttr.includes('T')) {
                    const timePart = dtAttr.split('T')[1].substring(0, 5); // "18:30"
                    if (timePart && timePart !== "00:00") {
                        let [h, m] = timePart.split(':').map(Number);
                        const ampm = h >= 12 ? 'PM' : 'AM';
                        h = h % 12 || 12;
                        cleanTime = `${h}:${String(m).padStart(2, '0')}${ampm}`;
                    }
                }

                // Fallback B: Match against full card text
                if (cleanTime === "TBA") {
                    const fallbackMatch = cardText.replace(/\./g, '').match(/\b(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\b/i);
                    if (fallbackMatch) cleanTime = formatTime(fallbackMatch[1]);
                }

                // Skip past games
                if (cleanDate !== 'TBA' && new Date(cleanDate) < today) continue;

                const finalTitle = `Mizzou Women's Basketball  VS ${cleanOpponent(opponent).toUpperCase()}`;
                const dedupeKey = `${cleanDate}-${finalTitle}`;

                if (seenWBB.has(dedupeKey)) continue;
                seenWBB.add(dedupeKey);

                venueData.push({
                    venue: 'Mizzou Arena',
                    title: finalTitle,
                    date: cleanDate,
                    time: cleanTime,
                    type: 'NCAA WB'
                });

                console.log(`✅ Kept: ${finalTitle} on ${cleanDate} (${cleanTime}) [NCAA WB]`);

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
        await page.waitForSelector('li[data-id], div[class*="sc-451c8dd0-2"], div[class*="sc-eb703eab-0"]', { timeout: 15000 });

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
            const items = document.querySelectorAll('li[data-id], div[class*="sc-451c8dd0-2"], div[class*="sc-eb703eab-0"]');

            items.forEach(item => {
                // 1. EXTRACT TITLE
                let title = "";

                // Attempt A: Direct title container
                const directTitle = item.querySelector('[class*="eMziwB"], [class*="hzNfZR"] span');
                if (directTitle) {
                    title = directTitle.innerText.trim();
                }

                // Attempt B: Accessible VisuallyHidden text on link or overflow button
                if (!title || title.toLowerCase() === 'find tickets') {
                    const hiddenTextEl = item.querySelector('button[aria-controls="eventOverflow"] .VisuallyHidden-sc-8buqks-0, a[data-testid="event-list-link"] .VisuallyHidden-sc-8buqks-0');
                    if (hiddenTextEl) {
                        const rawHidden = hiddenTextEl.innerText;
                        title = rawHidden.split(',')[0].replace(/Open additional information for/i, '').trim();
                    }
                }

                // Attempt C: Legacy class fallbacks
                if (!title || title.toLowerCase() === 'find tickets') {
                    const legacyTitle = item.querySelector('span[class*="ufMKn"], [class*="EventName"]');
                    if (legacyTitle) {
                        title = legacyTitle.innerText.trim();
                    }
                }

                if (!title || title.toLowerCase() === 'find tickets') return;

                // 2. EXTRACT DATE
                const hiddenDateEl = item.querySelector('.VisuallyHidden-sc-8buqks-0 span');
                const dateRaw = hiddenDateEl ? hiddenDateEl.innerText.trim() : "";

                // 3. EXTRACT TIME
                const timeEl = item.querySelector('span[class*="bZWmdt"] span, span[class*="fCBXcp"] .VisuallyHidden-sc-8buqks-0 span');
                const timeRaw = timeEl ? timeEl.innerText.trim() : "";

                if (dateRaw || timeRaw) {
                    results.push({ dateRaw, timeRaw, title });
                }
            });

            return results;
        });

        console.log(`📋 Found ${events.length} Mizzou Arena items on Ticketmaster. Processing...`);
        const seenEvents = new Set();

        for (const ev of events) {
            if (!ev.title) continue;

            let cleanTitle = ev.title.replace(/\s+/g, ' ').trim().toUpperCase();
            
            // Normalize TM title e.g. "2026-27 MIZZOU MEN'S BASKETBALL V CLEVELAND ST." -> "MISSOURI VS CLEVELAND STATE"
            let eventType = categorizeMizzouArena(cleanTitle);

            if (cleanTitle.includes("MEN'S BASKETBALL V ") || cleanTitle.includes("MENS BASKETBALL V ")) {
                const opp = cleanTitle.split(/MEN'?S BASKETBALL V /i)[1] || "";
                cleanTitle = `MISSOURI VS ${cleanOpponent(opp).toUpperCase()}`;
                eventType = 'NCAA MB';
            } else if (cleanTitle.includes("WOMEN'S BASKETBALL V ") || cleanTitle.includes("WOMENS BASKETBALL V ")) {
                const opp = cleanTitle.split(/WOMEN'?S BASKETBALL V /i)[1] || "";
                cleanTitle = `MISSOURI VS ${cleanOpponent(opp).toUpperCase()}`;
                eventType = 'NCAA WB';
            }

            const cleanDate = formatDate(ev.dateRaw);
            const timeMatch = ev.timeRaw.match(/\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)/i);
            const cleanTime = formatTime(timeMatch ? timeMatch[0] : (ev.timeRaw || 'TBA'));

            const dedupeKey = `${cleanDate}-${cleanTitle}`;
            if (seenEvents.has(dedupeKey)) continue;
            seenEvents.add(dedupeKey);

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

            console.log(`✅ Kept TM: ${cleanTitle} on ${cleanDate} (${cleanTime}) [${eventType}]`);
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
function formatDatePT(dateStr, defaultYear = String(THIS_YEAR)) {
    if (!dateStr || dateStr === 'TBA') return dateStr;

    // Clean up the string but DO NOT remove slashes anymore
    dateStr = dateStr.replace(/,\s*$/, '').trim();

    // 1. Handle numeric format (e.g., 3/7, 11/1, 10/24)
    const numericMatch = dateStr.match(/(\d+)\/(\d+)/);
    if (numericMatch) {
        const month = numericMatch[1].padStart(2, '0');
        const day = numericMatch[2].padStart(2, '0');
        return `${defaultYear}-${month}-${day}`;
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
        const year = textMatch[3] || defaultYear;
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

// ========================== PROVIDENCE PARK TIMBERS ==========================
// Opens timbers.com/schedule, clicks the "2027" season button (double-clicks if needed),
// confirms the page is on #competition=all&date=2027-01-01, STAYS there (no more page.goto),
// and scrapes the home matches at Providence Park.
async function scrapeProvidenceT(browser) {
    const TARGET_YEAR = String(NEXT_YEAR_NUM); // the next calendar year's season tab
    const TARGET_HASH = `#competition=all&date=${TARGET_YEAR}-01-01`;

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 900 }
    });
    const page = await context.newPage();
    const venueDataPT = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const onTargetYear = () => page.url().includes(`date=${TARGET_YEAR}`);
    const waitForTargetYear = async (ms) => {
        try {
            await page.waitForFunction(y => location.href.includes(`date=${y}`), TARGET_YEAR, { timeout: ms });
            return true;
        } catch { return false; }
    };

    try {
        console.log("Navigating to Providence Park Timbers Schedule...");
        await page.goto('https://www.timbers.com/schedule/', { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Dismiss cookie banner so it can't block the click
        try {
            const cookieBtn = page.locator('#onetrust-accept-btn-handler');
            if (await cookieBtn.isVisible({ timeout: 5000 })) await cookieBtn.click();
        } catch (e) {}

        // Wait for the season buttons (they hold the chevron icon) to render
        await page.waitForSelector('.mls-o-buttons__svg', { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(1500);

        // ---- STEP 1: click the "2027" button: <button>2027<div class="mls-o-buttons__svg">…chevron…</div></button>
        console.log(`🖱️ Clicking the ${TARGET_YEAR} season button...`);
        const yearBtn = page.locator('button, a, [role="button"]')
            .filter({ has: page.locator('.mls-o-buttons__svg') })
            .filter({ hasText: new RegExp(`^\\s*${TARGET_YEAR}\\s*$`) })
            .first();

        if (await yearBtn.count() > 0) {
            await yearBtn.scrollIntoViewIfNeeded().catch(() => {});
            await yearBtn.click();
            if (!(await waitForTargetYear(5000))) {
                console.log("   ↪︎ Single click didn't switch the season, double-clicking...");
                await yearBtn.dblclick();
                await waitForTargetYear(5000);
            }
        }

        // If the 2027 button wasn't visible, the season control may be a dropdown showing another
        // year (e.g. "2026"). Open it and pick 2027 from the list.
        if (!onTargetYear()) {
            const seasonToggle = page.locator('button, [role="button"]')
                .filter({ has: page.locator('.mls-o-buttons__svg') })
                .filter({ hasText: /^\s*20\d{2}\s*$/ })
                .first();
            if (await seasonToggle.count() > 0) {
                console.log("   ↪︎ Opening the season dropdown...");
                await seasonToggle.click();
                await page.waitForTimeout(800);
                const option = page.locator('li, a, button, [role="option"]')
                    .filter({ hasText: new RegExp(`^\\s*${TARGET_YEAR}\\s*$`) })
                    .filter({ hasNot: page.locator('.mls-o-buttons__svg') });
                const n = await option.count();
                for (let i = 0; i < n; i++) {
                    if (await option.nth(i).isVisible()) { await option.nth(i).click(); break; }
                }
                await waitForTargetYear(5000);
            }
        }

        // Last resort: set the hash on the SAME page (no reload), which is what the button does
        if (!onTargetYear()) {
            console.log("   ↪︎ Button didn't switch the season, setting the 2027 hash directly...");
            await page.evaluate(h => { window.location.hash = h; }, TARGET_HASH);
            await waitForTargetYear(5000);
        }

        console.log(`📍 Now on: ${page.url()}`);

        // ---- STEP 2: STAY on the 2027 page and let the match list load
        await page.waitForTimeout(2500);
        await page.waitForSelector('.mls-c-match-list__match', { timeout: 20000 }).catch(() => {});

        // Scroll down so lazily-loaded rows render; stop once the count stops growing
        let lastCount = -1;
        for (let i = 0; i < 10; i++) {
            const count = await page.locator('.mls-c-match-list__match').count();
            if (count === lastCount) break;
            lastCount = count;
            await page.mouse.wheel(0, 4000);
            await page.waitForTimeout(1000);
        }

        // If the site bounced back to another season, put it back on 2027 (same page, no reload)
        if (!onTargetYear()) {
            console.log("   ⚠️ Page left the 2027 view, switching back...");
            await page.evaluate(h => { window.location.hash = h; }, TARGET_HASH);
            await page.waitForTimeout(3000);
        }

        const rowCount = await page.locator('.mls-c-match-list__match').count();
        console.log(`   ↪︎ ${rowCount} match rows on the ${TARGET_YEAR} page`);
        if (rowCount === 0) {
            await page.screenshot({ path: 'providence_debug.png', fullPage: true }).catch(() => {});
            console.log("   ⚠️ No match rows found. Saved providence_debug.png");
        }

        // ---- STEP 3: scrape
        const matches = await page.evaluate(() => {
            const results = [];
            document.querySelectorAll('.mls-c-match-list__match').forEach(row => {
                const dateText = row.querySelector('.mls-c-status-stamp__status')?.innerText.trim() || "";
                if (dateText.toLowerCase().includes('final')) return;

                const anchor = row.querySelector('a[href*="/matches/"]');
                const href = anchor ? anchor.href : "";

                // Match URLs carry the date as mm-dd-yyyy
                let urlDate = "";
                const m = href.match(/(\d{2})-(\d{2})-(\d{4})/);
                if (m) urlDate = `${m[3]}-${m[1]}-${m[2]}`;

                const infoParagraphs = row.querySelectorAll('.mls-c-match-list__match-info p');
                const venue = infoParagraphs.length > 0 ? infoParagraphs[infoParagraphs.length - 1].innerText.trim() : "";
                const competition = infoParagraphs.length > 1 ? infoParagraphs[0].innerText.trim() : "";

                const home = anchor?.querySelector('.--home .mls-c-club__shortname, .--home .mls-c-club__name')?.innerText.trim() || "";
                const away = anchor?.querySelector('.--away .mls-c-club__shortname, .--away .mls-c-club__name')?.innerText.trim() || "";
                const time = anchor?.querySelector('.mls-c-scorebug span')?.innerText.trim() || "TBA";

                results.push({ title: `${home} vs ${away}`, home, venue, urlDate, dateText, time, competition });
            });
            return results;
        });

        let skippedAway = 0;
        const seen = new Set();

        for (const m of matches) {
            // Home matches at Providence Park only
            const venueLower = m.venue.toLowerCase();
            const isHome = venueLower.includes('providence park') ||
                (!m.venue && m.home.toLowerCase().includes('timbers'));
            if (!isHome) { skippedAway++; continue; }

            let type = 'Other';
            const comp = m.competition.toLowerCase();
            if (comp.includes('mls')) type = 'MLS';
            else if (comp.includes('nwsl')) type = 'NWSL';
            else if (comp.includes('next pro')) type = 'MLS Next Pro';

            // Date: URL slug first; otherwise the row text, read as a 2027 date
            let cleanDate = m.urlDate;
            if (!cleanDate) {
                const slash = m.dateText.match(/(\d{1,2})\/(\d{1,2})/);
                if (slash) {
                    cleanDate = `${TARGET_YEAR}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
                } else {
                    cleanDate = formatDatePT(m.dateText, TARGET_YEAR);
                }
            }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) cleanDate = 'TBA';

            if (cleanDate !== 'TBA') {
                const [y, mo, d] = cleanDate.split('-').map(Number);
                if (new Date(y, mo - 1, d) < today) continue;
            }

            const finalTitle = toTitleCase(m.title);
            const dedupeKey = `${cleanDate}-${finalTitle}`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);

            venueDataPT.push({
                venue: 'Providence Park',
                title: finalTitle,
                date: cleanDate,
                time: formatTimeProvidence(m.time),
                type: type
            });
            console.log(`✅ Kept: ${finalTitle} on ${cleanDate} (${formatTimeProvidence(m.time)}) [${type}]`);
        }

        console.log(`🏁 Providence Park Timbers: ${venueDataPT.length} home matches kept, ${skippedAway} away matches skipped.`);

    } catch (e) {
        console.log(`Providence Park Timbers failed: ${e.message}`);
        await page.screenshot({ path: 'providence_debug.png', fullPage: true }).catch(() => {});
    } finally {
        await page.close();
        await context.close();
    }
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
        if (month) return `${THIS_YEAR}-${month}-${day}`;
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
        console.log(`\n🚀 Scraping Providence Park...`);
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
        return `${THIS_YEAR}-${month}-${day}`;
    }
    return dateStr;
}

function adjustShellTime(timeStr) {
    if (!timeStr || timeStr === 'TBA') return 'TBA';
    // Example time shift adjustment if parsing 4:00 PM down to 2:00 PM CT
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (match) {
        let hrs = parseInt(match[1]);
        const mins = match[2];
        const ampm = match[3].toUpperCase();
        
        // Adjust hours (-2 hours shift as specified)
        hrs = hrs - 2;
        if (hrs <= 0) hrs += 12; // Simple 12-hr wrap safeguard
        
        return `${hrs}:${mins}${ampm}`;
    }
    return timeStr;
}

function formatTimeProvidence(timeStr) {
    if (!timeStr || timeStr === 'TBA') return timeStr;
    let clean = timeStr.replace(/\s+/g, '').toUpperCase();
    if (/^\d+(AM|PM)$/.test(clean)) {
        clean = clean.replace(/(\d+)/, '$1:00');
    }
    return adjustShellTime(clean);
}

function formatTimeSDNormal(timeStr) {
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
                time: formatTimeSDNormal(ev.rawTime.replace(/\./g, '')), // Remove periods from p.m.
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
        return `${THIS_YEAR}-${month}-${day}`;
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
        return `${THIS_YEAR}-${month}-${day}`;
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
    const NEXT_YEAR = String(NEXT_YEAR_NUM); // the next calendar year's season tab
    const NEXT_YEAR_HASH = `#competition=all&date=${NEXT_YEAR}-01-01`;

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 },
        // The site shows kickoff times in the browser's own time zone (your machine is on CT).
        // Running this browser in Eastern Time makes the site render ET times, DST included.
        timezoneId: 'America/New_York'
    });
    const page = await context.newPage();
    const venueData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const onYear = (y) => page.url().includes(`date=${y}`);
    const waitForYear = async (y, ms) => {
        try {
            await page.waitForFunction(yr => location.href.includes(`date=${yr}`), y, { timeout: ms });
            return true;
        } catch { return false; }
    };

    // Load every row on the current view, then read it
    const readSchedule = async () => {
        await page.waitForSelector('.mls-c-match-list__match, .mls-c-match-tile', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(2000);

        let lastCount = -1;
        for (let i = 0; i < 10; i++) {
            const count = await page.locator('.mls-c-match-list__match').count();
            if (count === lastCount) break;
            lastCount = count;
            await page.mouse.wheel(0, 4000);
            await page.waitForTimeout(1000);
        }

        return page.evaluate(() => {
            const results = [];
            document.querySelectorAll('.mls-c-match-list__match').forEach(row => {
                const matchLink = row.querySelector('a[href*="/matches/"]');
                const href = matchLink ? matchLink.href : "";

                let urlDate = "";
                const urlDateMatch = href.match(/(\d{2})-(\d{2})-(\d{4})/);
                if (urlDateMatch) urlDate = `${urlDateMatch[3]}-${urlDateMatch[1]}-${urlDateMatch[2]}`;

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

                if (href) results.push({ urlDate, statusText, home, away, time, competition, venue });
            });
            return results;
        });
    };

    const seenMatches = new Set();
    const processMatches = (rawMatches, fallbackYear) => {
        for (const m of rawMatches) {
            const venueLower = m.venue.toLowerCase();
            const isSubaruPark = venueLower.includes('subaru park') ||
                                 (m.home.toLowerCase().includes('philadelphia') && !venueLower.includes('stadium') && !venueLower.includes('field'));
            if (!isSubaruPark) continue;

            let cleanDate = m.urlDate;
            if (!cleanDate) {
                const slash = m.statusText.match(/(\d{1,2})\/(\d{1,2})/);
                if (slash) cleanDate = `${fallbackYear}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
            }

            const cleanTime = formatTime(m.time);

            // Compare in local time (new Date('yyyy-mm-dd') is UTC and drops today's match)
            if (cleanDate && /^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
                const [y, mo, d] = cleanDate.split('-').map(Number);
                if (new Date(y, mo - 1, d) < today) continue;
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

            const title = `${toTitleCase(m.home)} vs. ${toTitleCase(m.away)}`;
            const dedupeKey = `${cleanDate}-${title}`;
            if (seenMatches.has(dedupeKey)) continue;
            seenMatches.add(dedupeKey);

            venueData.push({
                venue: 'Subaru Park',
                title: title,
                date: cleanDate || 'TBA',
                time: cleanTime,
                type: type
            });
            console.log(`✅ Kept: ${title} on ${cleanDate} (${cleanTime} ET) [${type}]`);
        }
    };

    try {
        // ---------- PART 1: rest of the current season (anchored to today) ----------
        console.log(`\n🚀 Scraping Subaru Park Philadelphia Union (Anchored to ${todayISO}, times in ET)...`);
        await page.goto(`https://www.philadelphiaunion.com/schedule/#competition=all&date=${todayISO}`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Dismiss marketing and cookie popups
        try {
            const closePopup = page.locator('#closeIconContainer, [data-testid="closeIcon"], button[aria-label="Close"]').first();
            if (await closePopup.isVisible({ timeout: 4000 })) await closePopup.click();
        } catch (e) {}
        try {
            const cookieBtn = page.locator('#onetrust-accept-btn-handler');
            if (await cookieBtn.isVisible({ timeout: 4000 })) await cookieBtn.click();
        } catch (e) {}

        const currentMatches = await readSchedule();
        console.log(`📋 Found ${currentMatches.length} fixtures on the current Union schedule.`);
        processMatches(currentMatches, String(today.getFullYear()));

        // ---------- PART 2: click the 2027 button, STAY on that page, scrape ----------
        console.log(`🖱️ Clicking the ${NEXT_YEAR} season button...`);
        await page.mouse.wheel(0, -20000);
        await page.waitForTimeout(800);

        const yearBtn = page.locator('button, a, [role="button"]')
            .filter({ has: page.locator('.mls-o-buttons__svg') })
            .filter({ hasText: new RegExp(`^\\s*${NEXT_YEAR}\\s*$`) })
            .first();

        if (await yearBtn.count() > 0) {
            await yearBtn.scrollIntoViewIfNeeded().catch(() => {});
            await yearBtn.click();
            if (!(await waitForYear(NEXT_YEAR, 5000))) {
                console.log("   ↪︎ Single click didn't switch the season, double-clicking...");
                await yearBtn.dblclick();
                await waitForYear(NEXT_YEAR, 5000);
            }
        }

        // Season control may be a dropdown showing another year: open it and pick 2027
        if (!onYear(NEXT_YEAR)) {
            const seasonToggle = page.locator('button, [role="button"]')
                .filter({ has: page.locator('.mls-o-buttons__svg') })
                .filter({ hasText: /^\s*20\d{2}\s*$/ })
                .first();
            if (await seasonToggle.count() > 0) {
                console.log("   ↪︎ Opening the season dropdown...");
                await seasonToggle.click();
                await page.waitForTimeout(800);
                const option = page.locator('li, a, button, [role="option"]')
                    .filter({ hasText: new RegExp(`^\\s*${NEXT_YEAR}\\s*$`) })
                    .filter({ hasNot: page.locator('.mls-o-buttons__svg') });
                const n = await option.count();
                for (let i = 0; i < n; i++) {
                    if (await option.nth(i).isVisible()) { await option.nth(i).click(); break; }
                }
                await waitForYear(NEXT_YEAR, 5000);
            }
        }

        // Last resort: set the hash on the SAME page (no reload)
        if (!onYear(NEXT_YEAR)) {
            console.log("   ↪︎ Button didn't switch the season, setting the 2027 hash directly...");
            await page.evaluate(h => { window.location.hash = h; }, NEXT_YEAR_HASH);
            await waitForYear(NEXT_YEAR, 5000);
        }

        console.log(`📍 Now on: ${page.url()}`);

        const nextMatches = await readSchedule();

        // If the site bounced back to another season, switch back and read again
        let finalNext = nextMatches;
        if (!onYear(NEXT_YEAR)) {
            console.log("   ⚠️ Page left the 2027 view, switching back...");
            await page.evaluate(h => { window.location.hash = h; }, NEXT_YEAR_HASH);
            finalNext = await readSchedule();
        }

        console.log(`📋 Found ${finalNext.length} fixtures on the ${NEXT_YEAR} Union schedule.`);
        if (finalNext.length === 0) {
            await page.screenshot({ path: 'subaru_debug.png', fullPage: true }).catch(() => {});
            console.log("   ⚠️ No 2027 rows found. Saved subaru_debug.png");
        }
        processMatches(finalNext, NEXT_YEAR);

        console.log(`🏁 Subaru Park Union: ${venueData.length} home matches kept (2026 + 2027).`);

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
        return `${THIS_YEAR}-${month}-${day}`;
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
                            title: `${toTitleCase(t1)} vs. ${toTitleCase(t2)}`,
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
                    cleanDate = formatDate(`${match[0]} ${THIS_YEAR}`);
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
            venue: "Dicks Sporting Goods Park",
            title: toTitleCase(ev.title),
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
        //scrapeMizzouE(browser),
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
    const key = `${item.venue}|${item.title}|${item.date}|${item.time}|${item.type}`;
    if (!seenGlobal.has(key)) {
        seenGlobal.add(key);
        uniqueData.push(item);
    }
}

    //log the count
    console.log(`\nTotal events scraped: ${allData.length} (${uniqueData.length} after removing exact duplicates)`);

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
    if (uniqueData.length > 0) {
        await csvWriter.writeRecords(uniqueData);
        console.log('Done! All events saved to calendar-3.csv');
    } else {
        console.log('No data to write to CSV.');
    }

    await browser.close();
})();
