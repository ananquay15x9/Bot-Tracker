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

// JPJ EVENT TYPE
function categorizeJBJ(sport, title) {
    const s = sport.toLowerCase();
    const t = title.toLowerCase();
    if (s.includes('basketball')) {
        return s.includes('women') ? 'NCAA WB' : 'NCAA MB';
    }

    if (s.includes('wrestling')) return 'Wrestling';
    if (t.includes('concert') || t.includes('tour')) return 'Concert';
    return 'Other';
}

// VIRGINIA TECH - CASSELL COLISEUM EVENT TYPE
function categorizeVT(btnText, opponent) {
    const text = (btnText + " " + opponent).toUpperCase();

    // identify sport
    if (text.includes("WOMEN'S BASKETBALL")) return 'NCAA WB';
    if (text.includes("MEN'S BASKETBALL")) return 'NCAA MB';
    if (text.includes('VOLLEYBALL')) return 'NCAA WVB';
    if (text.includes('WRESTLING') || text.includes('ACC CHAMPIONSHIPS')) return 'Wrestling';
    if (text.includes('CONCERT')) return 'Concert';
    return 'Other';
}

// BRYCE JORDAN CENTER ENVENT TYPE
function categorizeBJC(title, description) {
    const fullText = (title + " " + (description || "")).toLowerCase();

    //NCAA MB
    if (fullText.includes('penn state vs.')) {
        return 'NCAA MB';
    }
    //Wrestling
    if (fullText.includes('wrestling')) {
        return 'Wrestling';
    }
    //Concert
    if (fullText.includes('tour') || fullText.includes('live') || fullText.includes('presents')) {
        if (fullText.includes('monster trucks')) return 'Other';
        return 'Concert';
    }
    return 'Other';
}

// AMERICA FIRST FIELD EVENT TYPE
function categorizeAmericaFF(title, description) {
    const t = title.toLowerCase();
    if (t.includes('real salt lake') || t.includes('rsl')) return 'MLS';
    if (t.includes('utah royals')) return 'NWSL';
    if (t.includes('real monarchs')) return 'MLS Next Pro';
    if (t.includes('concert') || t.includes('tour')) return 'Concert';
    return 'Other';
}

// RSLW EVENT TYPE
function categorizeRSLW(title) {
    const t = title.toLowerCase();
    if (t.includes('real salt lake') || t.includes('rsl')) return 'MLS';
    if (t.includes('utah royals')) return 'NWSL';
    if (t.includes('real monarchs')) return 'MLS Next Pro';
    if (t.includes('concert') || t.includes('tour')) return 'Concert';
    return 'Other';
}

// Neville Arena Gymnastics Event Type
function categorizeAuburn(sportText) {
    const s = sportText.toLowerCase();
    if (s.includes('men\'s basketball')) return 'NCAA MB';
    if (s.includes('women\'s basketball')) return 'NCAA WB';
    if (s.includes('volleyball')) return 'NCAA WVB';
    if (s.includes('gymnastics')) return 'Gymnastics';
    return 'Other';
}

// Baylor Transcend Killer
async function setupTranscendKiller(page) {
    await page.addInitScript(() => {
        const kill = () => {
            const host = document.querySelector('#transcend-consent-manager');
            if (host) host.remove();
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
        const type = route.request().resourceType();
        
        // Block only the heavy media and the consent manager
        if (
            u.includes('transcend-cdn.com') || 
            u.includes('transcend.io') || 
            ['image', 'media', 'font'].includes(type)
        ) {
            return route.abort();
        }
        return route.continue();
    });
}

// ======================================================================================
//===== JPJ Main Function
async function scrapeJPJ(browser) {
    const page = await browser.newPage();
    const venueData = [];
    const today = new Date().toISOString().split('T')[0];
    try {
        await page.goto('https://virginiasports.com/all-sports-schedule?type=home', { waitUntil: 'networkidle' });

        // JPJ Logic
        console.log(`\nScraping John Paul John Arena...`);

        // load more
        let hasMore = true;
        while (hasMore) {
            const btn = page.locator('button.load-more');
            if (await btn.isVisible()) {
                await btn.click();
                // Wait for the specific new items to appear
                await page.waitForTimeout(2000); 
            } else {
                hasMore = false;
            }
        }

        const rows = await page.locator('.schedule-event-item').all();
        console.log(`Processing ${rows.length} rows...`);

        for (const row of rows) {
            try {

                //extract date
                const dateVal = await row.locator('.schedule-event-date__month-day').first().innerText();
                const cleanDate = formatDate(`${dateVal.trim() } 2026`);
                if (cleanDate < today) continue;

                //opponent
                const opponentLoc = row.locator('.schedule-default-event__name').first();
                const opponent = await opponentLoc.innerText();

                //sport
                const sport = await row.locator('.schedule-event-item-links__sport-name').first().innerText();
                const sportClean = sport.trim();

                //sports that actually play inside the Arena
                const jpjSports = ["Men's Basketball", "Women's Basketball", "Wrestling"];
                if (!jpjSports.includes(sportClean)) {
                    continue; //
                }

                //time
                let timeVal = 'TBA';
                const timeLabel = row.locator('.schedule-event-item-result__label').first();
                if (await timeLabel.count() > 0) {
                    const rawTime = await timeLabel.innerText();
                    timeVal = formatTime(rawTime.replace(/E[DS]T/g, '').trim());
                }

                // skip if date in the past
                if (cleanDate < today && cleanDate !== "TBA") continue;

                venueData.push({
                    venue: 'John Paul John Arena',
                    title: `Virginia vs. ${opponent.trim()} (${sport.trim()})`,
                    date: cleanDate,
                    time: timeVal,
                    type: categorizeJBJ(sport, opponent)
                });
                console.log(`Pulling: ${opponent.trim()}`);

            } catch (e) {
                console.log(`Row failed: ${e.message.split('\n')[0]}`);
                continue;
            }
        }
    } catch (e) { console.log("John Paul John Arena failed: ", e); }
    await page.close();
    return venueData;
}

// =====Virginia Tech - Cassell Coliseum Main Function
async function scrapeVT(browser) {
    const page = await browser.newPage();
    const venueData = [];
    const monthsToScrape = 12;
    const today = new Date().toISOString().split('T')[0];
    try {
        await page.goto('https://hokiesports.com/all-sports-schedule?view=calendar&type=home', { waitUntil: 'networkidle' });

        // VT Logic
        console.log(`\nVirginia Tech - Cassell Coliseum...`);

        try {
        const acceptBtn = page.getByRole('button', { name: 'Accept' });
        if (await acceptBtn.isVisible({ timeout: 3000 })) await acceptBtn.click();
        await page.evaluate(() => {
            const b = document.getElementById('iubenda-cs-banner');
            if (b) b.remove();
        }).catch(() => {});
    } catch(e) {}
    console.log("Clicked 'Accepted Cookies")


    // jan 2026
    let currentMonth = await page.locator('.schedule-calendar-navigation__month').first().innerText();
    while (!currentMonth.includes('January 2026')) {
            const prevBtn = page.locator('.schedule-calendar-navigation__button').first();
            await prevBtn.dispatchEvent('click');
            await page.waitForTimeout(500);
            currentMonth = await page.locator('.schedule-calendar-navigation__month').first().innerText();
        }

        for (let i = 0; i < monthsToScrape; i++) {
            const header = page.locator('.schedule-calendar-navigation__month').first();
            const monthYearText = await header.innerText();
            console.log(`Pulling: ${monthYearText}`);

            // wait for events to load in the DOM
            await page.waitForSelector('.schedule-calendar-event', { timeout: 5000 }).catch(() => {});

            const dayCells = await page.locator('.schedule-calendar-day').all();

            for (const cell of dayCells) {
                const dayNumLoc = cell.locator('.schedule-calendar-day__number');
                if (await dayNumLoc.count() === 0) continue;

                const dayNum = await dayNumLoc.innerText();
                const cleanDate = formatDate(`${monthYearText.split(' ')[0]} ${dayNum} ${monthYearText.split(' ')[1]}`);

                const events = await cell.locator('.schedule-calendar-event').all();

                for (const event of events) {
                    try {
                        const details = event.locator('.schedule-calendar-event-details');

                        // only Cassell Coliseum
                        const location = await details.locator('.schedule-event-location').innerText();
                        if (!location.includes('Cassell Coliseum')) continue;

                        // get opponent name
                        const teamLocators = details.locator('.schedule-calendar-event-details-teams__team-name');
                        const teamCount = await teamLocators.count();

                        let opponent = "TBA";
                        if (teamCount > 1) {
                            //opponent name
                            opponent = await teamLocators.nth(1).innerText();
                        } else if (teamCount === 1) {
                            opponent = await teamLocators.first().innerText();
                        }

                        if (opponent.includes('Tech Talk Live') || opponent.includes('Hokie Sports Weekly')) {
                            continue;
                        }

                        const btnText = await event.locator('.schedule-calendar-event__button').innerText();
                        const eventType = categorizeVT(btnText, opponent);

                        let finalTime = "TBA";
                        const timeMatch = btnText.match(/(\d{1,2}(:\d{2})?\s*(?:PM|AM))/i);
                        if (timeMatch) finalTime = timeMatch[1];

                        venueData.push({
                            venue: 'Virginia Tech - Cassell Coliseum',
                            title: `Virginia Tech vs. ${opponent} (${btnText.split('-')[1]?.trim() || 'Event'})`,
                            date: cleanDate,
                            time: formatTime(finalTime),
                            type: eventType
                        });
                        console.log(`Pulling: ${cleanDate} - ${opponent.trim()} [${eventType}]`);

                    } catch (e) { continue; }
                }
            }

            // Move to Next Month
            const nextBtn = page.locator('.schedule-calendar-navigation__button').last();
            await nextBtn.dispatchEvent('click');
            await page.waitForFunction(
                (old) => document.querySelector('.schedule-calendar-navigation__month').innerText !== old,
                monthYearText
            ).catch(() => {});
            await page.waitForTimeout(1000);
        }

    } catch (e) { console.log("Virginia Tech - Cassell Coliseum failed: ", e); }
    await page.close();
    return venueData;
}

// =====BJC Main Function
async function scrapeBJC(browser) {
    const page = await browser.newPage();
    const venueData = [];
    const today = new Date().toISOString().split('T')[0];
    try {
        await page.goto('https://bjc.psu.edu/upcoming-events', { waitUntil: 'domcontentloaded' });

        // VT Logic
        console.log("Crawling Bryce Jordan Center...")
        // close chatbot immediately
        await page.addStyleTag({ content: '.satisfi_btn, .satisfi_container, #satisfi_chat_container { display: none !important; }' });

        const urls = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.main-event-image a')).map(a => a.href);
        });
        const uniqueUrls = [...new Set(urls)];

        for (const url of uniqueUrls) {
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded' });
                await page.addStyleTag({ content: '.satisfi_btn, .satisfi_container { display: none !important; }' });

                const rawTitle = await page.locator('h1.p20').innerText();
                const cleanTitle = rawTitle.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
                const description = await page.locator('.description.grey').innerText().catch(() => "");

                // look for dates
                const dateBlocks = page.locator('.event-date');
                const count = await dateBlocks.count();

                const seenEntries = new Set();

                for (let i = 0; i < count; i++) {
                    const block = dateBlocks.nth(i);
                    const rawDate = await block.locator('.date').innerText();
                    const timeText = await block.locator('.time').innerText();
                    const startsMatch = timeText.match(/Starts:\s*(.*)/i);

                    const cleanDate = formatDate(rawDate);
                    const eventTime = startsMatch ? formatTime(startsMatch[1]) : "TBA";

                    const uniqueKey = `${cleanDate}|${eventTime}`;

                    if (!seenEntries.has(uniqueKey)) {
                        if (cleanDate >= today || cleanDate === "TBA") {
                            venueData.push({
                                venue: 'Penn State: Bryce Jordan Center',
                                title: cleanTitle,
                                date: cleanDate,
                                time: eventTime,
                                type: categorizeBJC(cleanTitle, description)
                            });
                            seenEntries.add(uniqueKey);
                        }
                    }
                }
                // if no date found, then fallback
                if (seenEntries.size === 0) {
                    const sidebarDate = await page.locator('.sidebar-content-item:has-text("Date") .right').innerText().catch(() => null);
                    if (sidebarDate) {
                        const rawTime = await page.locator('.sidebar-content-item:has-text("Time") .right').innerText().catch(() => "TBA");
                        const cleanDate = formatDate(sidebarDate);
                        venueData.push({
                            venue: 'Penn State: Bryce Jordan Center',
                            title: cleanTitle,
                            date: cleanDate,
                            time: formatTime(rawTime),
                            type: categorizeBJC(cleanTitle, description)
                        });
                    }
                }
                console.log(`Pulling: ${cleanTitle}`);

            } catch (err) {
                console.log(`Failed: ${url}`);
            }
        }

    } catch (e) { console.log("Bryce Jordan Center failed: ", e); }
    await page.close();
    return venueData;
}

// =====BJC Main Function
function formatSimpleDate(monthStr, dayStr) {
    const monthMap = {
        'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04',
        'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08',
        'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
    };
    const month = monthMap[monthStr.toUpperCase()] || '01';
    const day = dayStr.padStart(2, '0');
    return `2026-${month}-${day}`;
}

//The date is correct, but the time is fake due to how complex this site is.

function categorizeAndAssignTime(title) {
    const t = title.toLowerCase();
    
    // Default categorizations
    if (t.includes('tour') || t.includes('yellowcard') || t.includes('kahan') || t.includes('souls')) {
        return { type: 'Concert', time: '7:00 PM' };
    }
    if (t.includes('breakaway') || t.includes('nation') || t.includes('homecoming')) {
        return { type: 'Other', time: '6:00 PM' };
    }
    
    return { type: 'Other', time: 'TBA' };
}

async function scrapeAmericaFF(browser) {
    const page = await browser.newPage();
    const venueData = [];
    const today = new Date().toISOString().split('T')[0];
    try {
        await page.goto('https://americafirstfield.com/event-calendar/', { waitUntil: 'domcontentloaded' });

        // BJC Logic
        //close cookie popup
    const cookieBtn = page.locator('#onetrust-accept-btn-handler');
    if (await cookieBtn.isVisible()) await cookieBtn.click();

    const events = [];
    const articles = page.locator('article.event');
    const count = await articles.count();

    for (let i = 0; i < count; i++) {
        const art = articles.nth(i);

        const rawTitle = await art.locator('.event-title').innerText();
        const month = await art.locator('.event-month').innerText();
        const day = await art.locator('.event-day').innerText();
        
        const cleanDate = formatSimpleDate(month, day);
        const { type, time } = categorizeAndAssignTime(rawTitle);
        const desc = await art.locator('.event-des').innerText();
        const timeMatch = desc.match(/(\d{1,2}:\d{2}\s?[APM]{2})/i);
        if (timeMatch) time = timeMatch[1];

        venueData.push({
            venue: 'America First Field',
            title: rawTitle.trim(),
            date: cleanDate,
            time: time,
            type: type
        });
    }

    } catch (e) { console.log("America First Field failed: ", e); }
    await page.close();
    return venueData;
}

// RSL MAIN FUNCTION
async function scrapeRSL(browser) {
    const page = await browser.newPage();
    let rslResults = [];
    const today = new Date().toISOString().split('T')[0];
    try {
        console.log("Navigating to RSL Schedule...");
        await page.goto('https://www.rsl.com/schedule/#competition=all&date=2026-02-08');

        // RSL logic
        //close cookie popup
        try {
            await page.waitForSelector('.mls-c-match-list__match', { timeout: 15000 });
            console.log("Data detected on page.");
        } catch (e) {
            console.log("Timeout: Matches didn't load.");
            await browser.close();
            return;
        }

        const rawData = await page.$$eval('.mls-c-match-list__match', (elements) => {
            return elements.map(el => {
                // get month year
                const section = el.closest('.mls-c-match-list__section');
                const header = section ? section.querySelector('h2') : null;
                const yearMatch = header ? header.innerText.match(/\d{4}/) : null;
                const year = yearMatch ? yearMatch[0] : "2026";

                // get date
                const dateStr = el.querySelector('.mls-c-status-stamp__status')?.innerText || "";
                const timeStr = el.querySelector('.mls-c-scorebug span')?.innerText || "TBA";

                // get team
                const teamSpans = Array.from(el.querySelectorAll('.mls-c-club__shortname'));
                const home = teamSpans[0]?.innerText || "Home TBD";
                const away = teamSpans[1]?.innerText || "Away TBD";

                // info
                const infoPs = Array.from(el.querySelectorAll('.mls-c-match-list__match-info p'));
                const competition = infoPs[0]?.innerText || "";
                const venue = infoPs[infoPs.length - 1]?.innerText || "";

                return { year, dateStr, timeStr, home, away, competition, venue };
            });
        });

        rslResults = rawData
            .filter(item => item.venue.toLowerCase().includes('america first field')) // ONLY America First Field
            .map(item => {
                const [m, d] = item.dateStr.split('/');
                const cleanDate = `${item.year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;

                let type = 'Other';
                const comp = item.competition.toLowerCase();
                if (comp.includes('mls')) type = 'MLS';
                if (comp.includes('next pro')) type = 'MLS Next Pro';
                if (comp.includes('nwsl')) type = 'NWSL';

                return {
                    venue: 'America First Field',
                    title: `${item.home} vs. ${item.away} (${item.competition})`,
                    date: cleanDate,
                    time: item.timeStr.replace(/\s/g, '').toUpperCase(),
                    type: type
                };
            });

        console.log(`Found ${rawData.length} total matches. Only kept ${rslResults.length} at America First Field.`);


    } catch (e) { console.log("RSL failed: ", e); }
    await page.close();
    return rslResults;
}

// RSLW MAIN FUNCTION
async function scrapeRSLW(browser) {
    const page = await browser.newPage();
    const today = new Date().toISOString().split('T')[0];
    let royalsData = []
    try {
        console.log("Navigating to Utah Royals Schedule...");
        await page.goto('https://www.rsl.com/utahroyals/schedule/#competition=all&date=2024-11-01');

        // RSLW Logic
        try {
        await page.waitForSelector('tr', { timeout: 10000 });
    } catch (e) {
        console.log("Table rows not found.");
        await browser.close();
        return;
    }

    const rawRows = await page.$$eval('tr', (rows) => {
        return rows.map(row => {
            const date = row.querySelector('td[data-label="Date"]')?.innerText || "";
            const home = row.querySelector('td[data-label="Home Team"]')?.innerText || "";
            const away = row.querySelector('td[data-label="Away Team"]')?.innerText || "";
            const time = row.querySelector('td[data-label="Time"]')?.innerText || "";
            const place = row.querySelector('td[data-label="Place"]')?.innerText || "";

            return { date, home, away, time, place };
        });
    });

    royalsData = rawRows
        // only take america first field otherwise skip
        .filter(item =>
            item.place.toLowerCase().includes('america first field') &&
            item.home.trim() !== ""
        )
        .map(item => {
            const fullTitle = `${item.home} vs. ${item.away}`;
            return {
                venue: 'America First Field',
                title: fullTitle,
                date: formatDate(item.date),
                time: formatTime(item.time),
                type: categorizeRSLW(fullTitle)
            };
        });

    console.log(`Pulling ${royalsData.length} home games.`);

    } catch (e) { console.log("Utah Royals failed: ", e); }
    await page.close();
    return royalsData;
}

// Auburn Gymnastics Main Function
async function scrapeNAGym(browser) {
    const page = await browser.newPage();
    let finalResults = [];

    try {
        console.log("Navigating to Neville Arena Schedule...");
        await page.goto('https://auburntigers.com/all-sports-schedule?type=home&sport-id=8');
        // Nagym Logic
        //load wait
        await page.waitForTimeout(5000);

        //cookies
        try {
            const cookieBtn = page.locator('button.iubenda-cs-accept-btn');
            if (await cookieBtn.isVisible({ timeout: 5000 })) {
                await cookieBtn.click();
                console.log("Cookies accepted.");
                await page.waitForTimeout(2000);
            }
        } catch (e) {
            console.log("No cookie banner found, moving on...");
        }

        await page.waitForSelector('.schedule-event-item', { timeout: 10000 });

        let venueData = await page.$$eval('.schedule-event-item', (events) => {
                return events.map(event => {
                    const dateDay = event.querySelector('.schedule-event-date__day')?.innerText || "";
                    const opponent = event.querySelector('.schedule-event-item__opponent-name')?.innerText || "";
                    const locationRow = event.querySelector('.schedule-event-item__location');
                    const venue = locationRow ? locationRow.innerText : "";
                    const time = event.querySelector('.schedule-event-item-result__label')?.innerText || "";
                    const sport = event.querySelector('.schedule-event-item__sport-name')?.innerText || "";
                    return { dateDay, opponent, venue, time, sport };
                });
            });

        const cleanedData = venueData
                .filter(item => item.venue.toLowerCase().includes('neville arena'))
                .map(item => {
                    const title = `Auburn vs. ${item.opponent}`;
                    return {
                        venue: 'Neville Arena',
                        title: title,
                        date: formatDate(item.dateDay),
                        time: formatTime(item.time),
                        type: 'Gymnastics'
                    };
                });

            finalResults = cleanedData;
            console.log(`Pulling ${finalResults.length} events at Neville Arena.`);

        } catch (e) { console.log("Neville Arena - Gymnastics failed: ", e); }
        await page.close();
        return finalResults;
    }

// Auburn Women Basketball Main Function
async function scrapeNAMB(browser) {
    const page = await browser.newPage();
    let finalResults = [];

    try {
        console.log("Navigating to Neville Arena Schedule...");
        await page.goto('https://auburntigers.com/all-sports-schedule?type=home&sport-id=9');
        // Nagym Logic
        //load wait
        await page.waitForTimeout(5000);

        //cookies
        try {
            const cookieBtn = page.locator('button.iubenda-cs-accept-btn');
            if (await cookieBtn.isVisible({ timeout: 5000 })) {
                await cookieBtn.click();
                console.log("Cookies accepted.");
                await page.waitForTimeout(2000);
            }
        } catch (e) {
            console.log("No cookie banner found, moving on...");
        }

        await page.waitForSelector('.schedule-event-item', { timeout: 10000 });

        let venueData = await page.$$eval('.schedule-event-item', (events) => {
                return events.map(event => {
                    const dateDay = event.querySelector('.schedule-event-date__day')?.innerText || "";
                    const opponent = event.querySelector('.schedule-event-item__opponent-name')?.innerText || "";
                    const locationRow = event.querySelector('.schedule-event-item__location');
                    const venue = locationRow ? locationRow.innerText : "";
                    const time = event.querySelector('.schedule-event-item-result__label')?.innerText || "";
                    const sport = event.querySelector('.schedule-event-item__sport-name')?.innerText || "";
                    return { dateDay, opponent, venue, time, sport };
                });
            });

        const cleanedData = venueData
                .filter(item => item.venue.toLowerCase().includes('neville arena'))
                .map(item => {
                    const title = `Auburn vs. ${item.opponent}`;
                    return {
                        venue: 'Neville Arena',
                        title: title,
                        date: formatDate(item.dateDay),
                        time: formatTime(item.time),
                        type: 'NCAA MB'
                    };
                });

            finalResults = cleanedData;
            console.log(`Pulling ${finalResults.length} events at Neville Arena.`);

        } catch (e) { console.log("Neville Arena - Men's Basketball failed: ", e); }
        await page.close();
        return finalResults;
    }

// Auburn Women's Basketball Main Function
async function scrapeNAWB(browser) {
    const page = await browser.newPage();
    let finalResults = [];

    try {
        console.log("Navigating to Neville Arena Schedule...");
        await page.goto('https://auburntigers.com/all-sports-schedule?type=home&sport-id=18');
        // Nagym Logic
        //load wait
        await page.waitForTimeout(5000);

        //cookies
        try {
            const cookieBtn = page.locator('button.iubenda-cs-accept-btn');
            if (await cookieBtn.isVisible({ timeout: 5000 })) {
                await cookieBtn.click();
                console.log("Cookies accepted.");
                await page.waitForTimeout(2000);
            }
        } catch (e) {
            console.log("No cookie banner found, moving on...");
        }

        await page.waitForSelector('.schedule-event-item', { timeout: 10000 });

        let venueData = await page.$$eval('.schedule-event-item', (events) => {
                return events.map(event => {
                    const dateDay = event.querySelector('.schedule-event-date__day')?.innerText || "";
                    const opponent = event.querySelector('.schedule-event-item__opponent-name')?.innerText || "";
                    const locationRow = event.querySelector('.schedule-event-item__location');
                    const venue = locationRow ? locationRow.innerText : "";
                    const time = event.querySelector('.schedule-event-item-result__label')?.innerText || "";
                    const sport = event.querySelector('.schedule-event-item__sport-name')?.innerText || "";
                    return { dateDay, opponent, venue, time, sport };
                });
            });

        const cleanedData = venueData
                .filter(item => item.venue.toLowerCase().includes('neville arena'))
                .map(item => {
                    const title = `Auburn vs. ${item.opponent}`;
                    return {
                        venue: 'Neville Arena',
                        title: title,
                        date: formatDate(item.dateDay),
                        time: formatTime(item.time),
                        type: 'NCAA WB'
                    };
                });

            finalResults = cleanedData;
            console.log(`Pulling ${finalResults.length} events at Neville Arena.`);

        } catch (e) { console.log("Neville Arena - Women's Basketball failed: ", e); }
        await page.close();
        return finalResults;
    }

// Auburn Women Volleyball Main Function
async function scrapeNAWVB(browser) {
    const page = await browser.newPage();
    let finalResults = [];

    try {
        console.log("Navigating to Neville Arena Schedule...");
        await page.goto('https://auburntigers.com/all-sports-schedule?type=home&sport-id=17');
        // Nagym Logic
        //load wait
        await page.waitForTimeout(5000);

        //cookies
        try {
            const cookieBtn = page.locator('button.iubenda-cs-accept-btn');
            if (await cookieBtn.isVisible({ timeout: 5000 })) {
                await cookieBtn.click();
                console.log("Cookies accepted.");
                await page.waitForTimeout(2000);
            }
        } catch (e) {
            console.log("No cookie banner found, moving on...");
        }

        await page.waitForSelector('.schedule-event-item', { timeout: 10000 });

        let venueData = await page.$$eval('.schedule-event-item', (events) => {
                return events.map(event => {
                    const dateDay = event.querySelector('.schedule-event-date__day')?.innerText || "";
                    const opponent = event.querySelector('.schedule-event-item__opponent-name')?.innerText || "";
                    const locationRow = event.querySelector('.schedule-event-item__location');
                    const venue = locationRow ? locationRow.innerText : "";
                    const time = event.querySelector('.schedule-event-item-result__label')?.innerText || "";
                    const sport = event.querySelector('.schedule-event-item__sport-name')?.innerText || "";
                    return { dateDay, opponent, venue, time, sport };
                });
            });

        const cleanedData = venueData
                .filter(item => item.venue.toLowerCase().includes('neville arena'))
                .map(item => {
                    const title = `Auburn vs. ${item.opponent}`;
                    return {
                        venue: 'Neville Arena',
                        title: title,
                        date: formatDate(item.dateDay),
                        time: formatTime(item.time),
                        type: 'NCAA WB'
                    };
                });

            finalResults = cleanedData;
            console.log(`Pulling ${finalResults.length} events at Neville Arena.`);

        } catch (e) { console.log("Neville Arena - Women's Volleyball failed: ", e); }
        await page.close();
        return finalResults;
    }

// BAYLOR MAIN FUNCTION
async function scrapeBaylor(browser)  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await setupTranscendKiller(page);

    let BaylorResult = [];

    try {
        console.log("Navigating to Baylor Bears Calendar...");
        await page.goto('https://baylorbears.com/calendar', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);

        for (let m = 0; m < 13; m++) {
            const monthTitle = await page.locator('.fc-toolbar-title').innerText();
            console.log(`Pulling: ${monthTitle}`);

            const eventHarnesses = page.locator('.fc-daygrid-event-harness');
            const count = await eventHarnesses.count();

            for (let i = 0; i < count; i++) {
                const harness = eventHarnesses.nth(i);
                const text = await harness.innerText();

                if (text.includes('WBB') || text.includes('MBB') || text.includes('CONCERT')) {
                    try {
                        await harness.click({ force: true });

                        await page.waitForSelector('.c-calendar-modal__wrapper', { state: 'visible', timeout: 5000 });
                        await page.waitForTimeout(1000);

                        const rawDate = await page.locator('.s-text-heading-small').first().innerText();
                        const cards = page.locator('[data-test-id="s-game-card-standard__root"]');
                        const cardCount = await cards.count();

                        for (let j = 0; j < cardCount; j++) {
                            const card = cards.nth(j);
                            const cardText = await card.innerText();

                            if (cardText.toLowerCase().includes('foster pavilion')) {
                                const opponent = await card.locator('[data-test-id="s-game-card-standard__header-team-opponent-link"]').innerText();
                                const sportCode = await card.locator('.mx-\\[4px\\]').innerText();

                                const timeElem = card.locator('[aria-label="Event Time"]');
                                let rawTime = "TBA";
                                if (await timeElem.count() > 0) {
                                    rawTime = await timeElem.innerText();
                                }

                                let type = 'Other';
                                if (sportCode.includes('MBB')) type = 'NCAA MB';
                                if (sportCode.includes('WBB')) type = 'NCAA WB';

                                BaylorResult.push({
                                    venue: 'Foster Pavilion',
                                    title: `Baylor vs. ${opponent}`,
                                    date: formatDate(rawDate),
                                    time: formatTime(rawTime),
                                    type: type
                                });
                                console.log(`Pulling: ${opponent} (${sportCode})`);
                            }
                        }

                        await page.locator('button:has-text("Close")').first().click();
                        await page.waitForTimeout(600);
                    } catch (err) {
                        await page.keyboard.press('Escape');
                    }
                }
            }
            await page.getByTitle('Next month').click();
            await page.waitForTimeout(2000);
        }

        } catch (e) { console.log("Baylor failed: ", e); }
        await page.close();
        return BaylorResult;
    }


// =======================================================================================

(async () => {
    const browser = await chromium.launch ({ headless: false });

    //run them one by one to keep memory clean
    const results = await Promise.all([
        scrapeJPJ(browser),
        scrapeVT(browser),
        scrapeBJC(browser),
        scrapeAmericaFF(browser),
        scrapeRSL(browser),
        scrapeRSLW(browser),
        scrapeNAGym(browser),
        scrapeNAMB(browser),
        scrapeNAWB(browser),
        scrapeNAWVB(browser),
        scrapeBaylor(browser)
    ]);

    // flatten the array
    const allData = results.flat();

    //log the count
    console.log(`\nTotal events scraped: ${allData.length}`);

    // write to CSV
    const csvWriter = createCsvWriter({
        path: 'calendar-2.csv',
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
        console.log('Done! All events saved to calendar-2.csv');
    } else {
        console.log('No data to write to CSV.');
    }

    await browser.close();
})();