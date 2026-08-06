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


// Xfinity Center - Sports
function getSportFullName(code) {
    if (!code) return "";
    const cleanCode = String(code).toUpperCase().trim();

    // normalize a lookup key by removing dots/spaces and keeping letters, numbers and '&'
    const key = cleanCode.replace(/\./g, '').replace(/\s+/g, '').replace(/[^A-Z0-9&]/g, '');

    const sportMap = {
        'FB': 'Football',
        'MBB': "Men's Basketball",
        'WBB': "Women's Basketball",
        'WLAX': "Women's Lacrosse",
        'T&F': 'Track & Field',
        'TF': 'Track & Field',
        'WVB': "Women's Volleyball",
        'VB': 'Volleyball',
        'SB': 'Softball',
        'SOFTBALL': 'Softball',
        'BASE': 'Baseball',
        'BASEBALL': 'Baseball',
        'MSOC': "Men's Soccer",
        'WSOC': "Women's Soccer",
        'CHEER': 'Cheerleading'
    };

    return sportMap[key] || sportMap[cleanCode] || cleanCode;
}


async function scrapeXfinityS(browser)  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await setupTranscendKillerXS(page);

    let venueData = [];

    try {
        console.log("🚀 Navigating to Maryland Xfinity Calendar...");
        await page.goto('https://umterps.com/calendar', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('.fc-daygrid-body', { timeout: 15000 });

        for (let m = 0; m < 12; m++) {
            await page.waitForSelector('.fc-daygrid-day', { timeout: 10000 });
            const monthText = await page.locator('.fc-toolbar-title').first().innerText();
            console.log(`📅 Processing layout grid for: ${monthText}`);

            // Expand hidden day events
            await page.evaluate(() => {
                document.querySelectorAll('.fc-daygrid-more-link').forEach(link => {
                    if (link instanceof HTMLElement) link.click();
                });
            });
            await page.waitForTimeout(1000);

            const eventsInGrid = page.locator('td.fc-daygrid-day:not(.fc-day-other) .fc-daygrid-event, td.fc-daygrid-day:not(.fc-day-other) .fc-daygrid-dot-event');
            const totalEvents = await eventsInGrid.count();
            console.log(`🔍 Found ${totalEvents} event rows to check inside this grid view.`);

            for (let i = 0; i < totalEvents; i++) {
                if (page.isClosed()) break;

                try {
                    const currentEvent = eventsInGrid.nth(i);
                    await currentEvent.waitFor({ state: 'visible', timeout: 3000 });
                    await currentEvent.scrollIntoViewIfNeeded();

                    // Pre-click date extraction
                    const parentCell = currentEvent.locator('xpath=ancestor::td[contains(@class, "fc-daygrid-day")]');
                    const cleanDate = await parentCell.getAttribute('data-date');

                    await currentEvent.click({ force: true });
                    await page.waitForTimeout(800);

                    const dialogContainer = page.locator('[role="dialog"], .fc-popover, .fc-popover-body').last();
                    
                    // Location verification
                    const locationDetailsLoc = dialogContainer.locator('[data-test-id="s-game-card-facility-and-location__standard-location-details"], .s-text-paragraph-small span, [class*="location"]').last();
                    const facilityTitleLoc = dialogContainer.locator('[data-test-id="s-game-card-facility-and-location__standard-facility-title"]');

                    let locationText = (await locationDetailsLoc.count() > 0) ? await locationDetailsLoc.innerText() : "";
                    let facilityText = (await facilityTitleLoc.count() > 0) ? await facilityTitleLoc.first().innerText() : "";
                    const unifiedLocation = `${facilityText} ${locationText}`.toUpperCase();

                    const isLocalArena = unifiedLocation.includes("XFINITY CENTER") || 
                        (unifiedLocation.includes("COLLEGE PARK, MD") && 
                         !unifiedLocation.includes("SECU STADIUM") && 
                         !unifiedLocation.includes("SMITH STADIUM") && 
                         !unifiedLocation.includes("SOFTBALL STADIUM"));

                    if (isLocalArena) {
                        const sportCodeLoc = dialogContainer.locator('[data-test-id="s-game-card-standard__header-sport-name"] span, .s-game-card__header-sport-name span, .slot-event-item span:nth-child(3)').first();
                        let rawSportCode = (await sportCodeLoc.count() > 0) ? await sportCodeLoc.innerText() : "";
                        
                        if (!rawSportCode) {
                            const inlineNodeText = await currentEvent.innerText();
                            const matchCode = inlineNodeText.match(/(MBB|WBB|WLAX|T&F|FB|WVB|BASE|SB)/i);
                            if (matchCode) rawSportCode = matchCode[0];
                        }
                        const fullSportName = getSportFullName(rawSportCode);

                        let opponentTitle = "";
                        const opponentLinkLoc = dialogContainer.locator('[data-test-id="s-game-card-standard__header-team-opponent-link"], a[href*="/opponent/"]');
                        const alternativeTitleLoc = dialogContainer.locator('.s-game-card__header__team-event-info p, h2, h3').first();

                        if (await opponentLinkLoc.count() > 0) {
                            opponentTitle = await opponentLinkLoc.first().innerText();
                        } else if (await alternativeTitleLoc.count() > 0) {
                            opponentTitle = await alternativeTitleLoc.innerText();
                        } else {
                            opponentTitle = await currentEvent.innerText();
                        }

                        let finalTitle = opponentTitle.replace(/\s+/g, ' ').trim().toUpperCase();
                        if (finalTitle.includes("EVENTS") || finalTitle.includes("CALENDAR") || finalTitle.includes("XFINITY")) {
                            finalTitle = "MARYLAND COMPETITION";
                        }

                        if (fullSportName && !finalTitle.includes(fullSportName.toUpperCase())) {
                            if (!finalTitle.includes("VS") && finalTitle !== "MARYLAND COMPETITION") {
                                finalTitle = `MARYLAND VS ${finalTitle}`;
                            }
                            finalTitle = `${finalTitle} (${fullSportName.toUpperCase()})`;
                        }

                        let rawTime = "TBA";
                        const timeLoc = dialogContainer.locator('[aria-label="Event Time"]').last();

                        if (await timeLoc.count() > 0) {
                            rawTime = await timeLoc.evaluate(el => el.textContent || '');
                            rawTime = rawTime.replace(/\s+/g, ' ').trim();
                        }

                        const timeMatch = rawTime.match(/\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)/i);
                        const cleanTime = formatTime(timeMatch ? timeMatch[0].toUpperCase() : 'TBA');

                        const today = new Date();
                        today.setHours(0,0,0,0);
                        const eventDate = new Date(cleanDate);

                        if (eventDate >= today) {
                            venueData.push({
                                venue: 'Xfinity Center',
                                title: finalTitle,
                                date: cleanDate,
                                time: cleanTime,
                                type: fullSportName
                            });
                            console.log(`✅ Kept: ${finalTitle} on ${cleanDate} (${cleanTime})`);
                        }
                    } else {
                        console.log(` Skip (Offsite/Stadium Event): ${locationText || 'Unknown Location'}`);
                    }

                    // Reset open modal windows safely before next index
                    const closeBtn = dialogContainer.locator('button:has-text("Close"), button.fc-popover-close, .close').first();
                    if (await closeBtn.count() > 0 && await closeBtn.isVisible()) {
                        await closeBtn.click();
                        await page.waitForTimeout(300);
                    } else {
                        await page.keyboard.press('Escape').catch(() => {});
                        await page.waitForTimeout(300);
                    }
                } catch (innerErr) {
                    console.log(`⚠️ Card match skip inside step index ${i}: ${innerErr.message}`);
                    await page.keyboard.press('Escape').catch(() => {});
                    await page.waitForTimeout(300);
                }
            }

            // Advance month
            const nextBtn = page.locator('.fc-next-button').first();
            if (await nextBtn.count() > 0 && await nextBtn.isVisible()) {
                await nextBtn.click();
                await page.waitForTimeout(1200);
            } else {
                break;
            }
        }
    } catch (err) {
        console.error("Maryland Xfinity Sports Failed:", err.message);
    } finally {
        await page.close();
        await context.close();
    }

    return venueData;
}



// ENMARKET MAIN FUNCTION
function formatDateEnmarket(dateStr) {
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

function formatTimeEnmarket(timeStr) {
    if (!timeStr || timeStr === 'TBA') return timeStr;

    let clean = timeStr.replace(/CT/i, '').replace(/\./g, '').replace(/\s+/g, '').toUpperCase();

    if (/^\d+(AM|PM)$/.test(clean)) {
        clean = clean.replace(/(\d+)/, '$1:00');
    }
    return clean;
}

function categorizeEnmarket(title, description) {
    const titleLower = title.toLowerCase();


    // NCAA MB / NCAA WB
    if (titleLower.includes('savannah steel') || titleLower.includes('jacksonville waves') || titleLower.includes('basketball')) {
        return 'NCAA WB'; // Grouped under women's basketball tracking
    }

    // Concert
    const musicKeywords = [
        'tour', 'album', 'concert', 'live', 'band', 'presents', 'show', 
        'music', 'festival', 'night', 'experience', 'comedy', 'comedian', 'phish'
    ];
    if (musicKeywords.some(kw => titleLower.includes(kw))) {
        return 'Concert';
    }

    return 'Other';
}

function extractTMID(url) {
    if (!url) return 'N/A';
    const match = url.match(/\/event\/([A-Z0-9]{16})/i);
    return match ? match[1] : 'N/A';
}

async function scrapeEnmarket(browser) {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 }
    });
    const page = await context.newPage();
    const venueData = [];

    try {
        console.log('🚀 Navigating to Enmarket Arena Schedule...');
        await page.goto('https://www.ticketmaster.com/enmarket-arena-tickets-savannah/venue/115882', { waitUntil: 'domcontentloaded' });

        // Bypass privacy consent popup if present
        try { await page.getByRole('button', { name: 'Accept All' }).click({ timeout: 3000 }); } catch (e) {}

        console.log("⏳ Waiting for event listings...");
        await page.waitForSelector('li[data-id]', { timeout: 15000 });

        // Handle "Load More" pagination natively on Ticketmaster
        try {
            const loadMoreBtn = page.locator('button[data-testid="event-list-load-more"]');
            while (await loadMoreBtn.isVisible()) {
                await loadMoreBtn.scrollIntoViewIfNeeded();
                await loadMoreBtn.click();
                console.log('🖱️ Expanded "Load More" events list...');
                await page.waitForTimeout(1500);
            }
        } catch (e) {
            console.log('Pagination settled or no additional events remaining.');
        }

        const eventItems = await page.locator('li[data-id]').all();
        console.log(`📋 Found ${eventItems.length} events on the grid. Parsing fields...`);

        for (const item of eventItems) {
            try {
                // 1. EXTRACT TITLE
                const titleLoc = item.locator('span[class*="ufMKn"], [class*="EventName"]').first();
                let rawTitle = "";
                if (await titleLoc.count() > 0) {
                    rawTitle = await titleLoc.innerText();
                } else {
                    const linkLoc = item.locator('a[data-testid="event-list-link"]').first();
                    if (await linkLoc.count() > 0) {
                        const fullText = await linkLoc.innerText();
                        rawTitle = fullText.split('\n')[0].trim();
                    }
                }

                if (!rawTitle) continue;

                // 2. EXTRACT DATE
                let constructedDateStr = "";
                const hiddenDateLoc = item.locator('span.VisuallyHidden-sc-8buqks-0 span').first();
                if (await hiddenDateLoc.count() > 0) {
                    constructedDateStr = await hiddenDateLoc.innerText(); // E.g., "August 21, 2026"
                }

                // 3. EXTRACT TIME
                let rawTime = "TBA";
                const timeLoc = item.locator('span[class*="bZWmdt"] span, span[aria-hidden="true"] span').first();
                if (await timeLoc.count() > 0) {
                    rawTime = await timeLoc.innerText(); // E.g., "7:00 PM"
                }

                const cleanDate = formatDate(constructedDateStr);
                const timeMatch = rawTime.match(/\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)/i);
                const cleanTime = formatTime(timeMatch ? timeMatch[0] : 'TBA');
                const eventType = categorizeEnmarket(rawTitle);

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                if (cleanDate !== 'TBA' && new Date(cleanDate) < today) {
                    console.log(`⏩ Skipping past event: ${rawTitle.trim().toUpperCase()} on ${cleanDate}`);
                    continue;
                }

                venueData.push({
                    venue: 'Enmarket Arena',
                    title: rawTitle.trim().toUpperCase(),
                    date: cleanDate,
                    time: cleanTime,
                    type: eventType
                });

                console.log(`✅ Extracted: ${rawTitle.trim().toUpperCase()} on ${cleanDate} (${cleanTime})`);

            } catch (innerErr) {
                console.log(`⚠️ Skipping an event due to parsing error: ${innerErr.message}`);
            }
        }

    } catch (e) { 
        console.log("❌ Enmarket Arena failed: ", e.message); 
    } finally {
        await page.close();
        await context.close();
    }

    return venueData;
}

// =======================================================================================
// ALLIANZ FIELD MAIN FUNCTION
// =======================================================================================
//convert iso timestamp 
function parseDateTimeAllianz(rawText) {
    if (!rawText) return { date: 'TBA', time: 'TBA' };

    const monthMap = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
    };

    // Extract date 
    const dateMatch = rawText.match(/([A-Za-z]+)\s+(\d+),\s+(\d{4})/i);
    let dateISO = 'TBA';
    if (dateMatch) {
        const month = monthMap[dateMatch[1].toLowerCase().substring(0, 3)];
        const day = dateMatch[2].padStart(2, '0');
        const year = dateMatch[3];
        if (month) dateISO = `${year}-${month}-${day}`;
    }

    // Extract time 
    const timeMatch = rawText.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i);
    let cleanTime = 'TBA';
    if (timeMatch) {
        cleanTime = timeMatch[0].replace(/\s+/g, '').toUpperCase();
        if (/^\d+(AM|PM)$/.test(cleanTime)) {
            cleanTime = cleanTime.replace(/(\d+)/, '$1:00');
        }
    }

    return { date: dateISO, time: cleanTime };
}

// Categorize Allianz Field events
function categorizeAllianz(title, categoriesText) {
    const combined = `${title} ${categoriesText}`.toLowerCase();

    if (combined.includes('mnufc 2') || combined.includes('mls next pro')) {
        return 'MLS Next Pro';
    }
    
    if (combined.includes('nwsl') || combined.includes('aurora')) {
        return 'NWSL';
    }

    if (combined.includes('mnufc') || combined.includes('mls') || combined.includes('leagues cup') || combined.includes('minnesota united')) {
        return 'MLS';
    }

    const musicKeywords = ['concert', 'tour', 'album', 'live in', 'yacht rock', 'gramm', 'band', 'presents'];
    const isMusic = musicKeywords.some(kw => combined.includes(kw));
    
    if (isMusic && !combined.includes('tournament') && !combined.includes('sports federation')) {
        return 'Concert';
    }

    return 'Other';
}

async function scrapeAllianzField(browser) {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 }
    });

    const page = await context.newPage();
    let venueData = [];

    try {
        console.log("🚀 Navigating to Allianz Field Calendar...");
        await page.goto('https://www.allianzfield.com/events', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        await page.waitForTimeout(2000);

        await page.waitForSelector('.event_items.w-dyn-item', { timeout: 15000 }).catch(() => {
            console.log("No dynamic event items found on page load.");
        });

        // Scroll to the bottom of the page to load all Webflow events
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
        await page.waitForTimeout(1000);

        // Extract raw event card data
        const rawEvents = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('.event_items.w-dyn-item');

            cards.forEach(card => {
                const titleEl = card.querySelector('.event_label-copy.h4');
                const title = titleEl ? titleEl.innerText.trim() : "";

                const dateEl = card.querySelector('.event_date_bold:not(.w-condition-invisible)');
                const dateTimeStr = dateEl ? dateEl.innerText.trim() : "";

                const catEls = card.querySelectorAll('.concession_section:not(.dash)');
                const categories = Array.from(catEls).map(el => el.innerText.trim()).join(' | ');

                if (title && dateTimeStr) {
                    results.push({ title, dateTimeStr, categories });
                }
            });
            return results;
        });

        console.log(`📋 Found ${rawEvents.length} total Allianz Field event cards. Filtering and parsing...`);

        const today = new Date();
        today.setHours(0,0,0,0);

        for (const ev of rawEvents) {
            const { date: cleanDate, time: cleanTime } = parseDateTimeAllianz(ev.dateTimeStr);
            const eventType = categorizeAllianz(ev.title, ev.categories);

            // Filter out past events
            if (cleanDate !== 'TBA' && new Date(cleanDate) < today) {
                console.log(`⏩ Skipping past event: ${ev.title} on ${cleanDate}`);
                continue;
            }

            venueData.push({
                venue: 'Allianz Field',
                title: ev.title.trim().toUpperCase(),
                date: cleanDate,
                time: cleanTime,
                type: eventType
            });

            console.log(`✅ Kept: ${ev.title.toUpperCase()} on ${cleanDate} (${cleanTime}) [${eventType}]`);
        }
    } catch (err) {
        console.log("❌ Allianz Field scraping error:", err.message);
    } finally {
        await page.close();
        await context.close();
    }

    return venueData;
}

// hiện tại crawler đang bị lỗi, cần phải fix tại vì bị timeout mất rồi
// =======================================================================================

(async () => {
    const browser = await chromium.launch ({ headless: false });

    //run them one by one to keep memory clean
    const results = await Promise.all([
        scrapeEnmarket(browser),
        scrapeXfinityS(browser),
        scrapeAllianzField(browser)
    ]);

    // flatten the array
    const allData = results.flat();

    //log the count
    console.log(`\nTotal events scraped: ${allData.length}`);

    // write to CSV
    const csvWriter = createCsvWriter({
        path: 'calendar-4.csv',
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
        console.log('Done! All events saved to calendar-4.csv');
    } else {
        console.log('No data to write to CSV.');
    }

    await browser.close();
})();