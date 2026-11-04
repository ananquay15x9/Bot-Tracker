const { chromium } = require('playwright');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// ========================== HELPER FUNCTIONS ==========================

function toTitleCase(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .split(' ')
        .map(word => {
            // Keep specific acronyms and abbreviations uppercase
            const upperAcronyms = ['vs.', 'vs', 'echl', 'ncaa', 'mbb', 'wbb', 'wvb', 'sec', 'umd', 'lsu', 'pmac', 'mls'];
            if (upperAcronyms.includes(word.toLowerCase())) {
                if (word.toLowerCase() === 'vs.' || word.toLowerCase() === 'vs') return 'vs.';
                return word.toUpperCase();
            }
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
}

// Convert date to yyyy-mm-dd format
function formatDate(dateStr) {
    if (!dateStr || dateStr === 'TBA' || dateStr.includes('-')) {
        return dateStr;
    }

    dateStr = dateStr.replace(/,\s*$/, '').trim();

    const monthMap = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
    };

    dateStr = dateStr.replace(/\//g, '').trim();

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

// Format time to 12:00AM or 12:00PM (no space)
function formatTime(timeStr) {
    if (!timeStr || timeStr === 'TBA') {
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

    return cleaned.replace(/\s+/g, '');
}

// ISO Helpers for Localist calendar (LSU)
function parseIsoDate(isoStr) {
    if (!isoStr) return 'TBA';
    return isoStr.split('T')[0];
}

function parseIsoTime(isoStr) {
    if (!isoStr || !isoStr.includes('T')) return 'TBA';

    const timePart = isoStr.split('T')[1].substring(0, 5);
    let [hours, minutes] = timePart.split(':').map(Number);

    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;

    return `${hours}:${String(minutes).padStart(2, '0')}${ampm}`;
}

// Popups and Transcend Manager Killer
async function setupTranscendKiller(page) {
    await page.addInitScript(() => {
        const kill = () => {
            const host = document.querySelector('#transcend-consent-manager, .satisfi_btn, .satisfi_container, #satisfi_chat_container, .satisfi_close');
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
        if (
            u.includes('transcend-cdn.com') ||
            u.includes('transcend.io') ||
            u.includes('satisfi') ||
            (u.includes('/consent') && u.includes('transcend'))
        ) {
            return route.abort();
        }
        return route.continue();
    });
}

// =========================================================================
// 1. ENMARKET ARENA
// =========================================================================
function categorizeEnmarket(title) {
    const t = (title || "").toLowerCase();

    // 1. ECHL Hockey
    if (t.includes('ghost pirates') || t.includes('gladiators') || t.includes('echl') || t.includes('hockey') || t.includes('icemen')) {
        return 'ECHL';
    }

    // 2. Concerts & Musical Performances (handles Lil Wayne, tours, rap, comedy)
    const musicKeywords = [
        'wayne', 'carter', 'tour', 'album', 'concert', 'live', 'band', 'presents', 'show', 
        'music', 'festival', 'night', 'experience', 'comedy', 'comedian', 'phish', 'vibes', 'rap'
    ];
    if (musicKeywords.some(kw => t.includes(kw)) && !t.includes('shootout') && !t.includes('tournament')) {
        return 'Concert';
    }

    // 3. Women's Pro / College Basketball (if explicitly stated)
    if (t.includes('savannah steel') || t.includes('jacksonville waves')) {
        return 'NCAA WB';
    }

    // 4. Everything else (Volleyball, Hoops Shootout, Cirque, Monster Trucks) -> Other
    return 'Other';
}

async function scrapeEnmarket(browser) {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 }
    });
    const page = await context.newPage();
    const venueData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const seenEvents = new Set();

    try {
        console.log('\n🚀 Scraping Enmarket Arena Schedule...');
        await page.goto('https://www.ticketmaster.com/enmarket-arena-tickets-savannah/venue/115882', { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000 
        });

        try { await page.getByRole('button', { name: 'Accept All' }).click({ timeout: 3000 }); } catch (e) {}

        console.log("⏳ Waiting for Enmarket event listings...");
        await page.waitForSelector('li[data-id], div[class*="sc-451c8dd0-2"]', { timeout: 15000 });

        try {
            const loadMoreBtn = page.locator('button[data-testid="event-list-load-more"]');
            while (await loadMoreBtn.isVisible({ timeout: 2000 })) {
                await loadMoreBtn.scrollIntoViewIfNeeded();
                await loadMoreBtn.click();
                await page.waitForTimeout(1500);
            }
        } catch (e) {}

        const eventItems = await page.locator('li[data-id], div[class*="sc-451c8dd0-2"]').all();
        console.log(`📋 Found ${eventItems.length} Enmarket items on the grid.`);

        for (const item of eventItems) {
            try {
                let rawTitle = "";

                const directTitleLoc = item.locator('[class*="eMziwB"], [class*="hzNfZR"] span').first();
                if (await directTitleLoc.count() > 0) {
                    rawTitle = (await directTitleLoc.innerText()).trim();
                }

                if (!rawTitle || rawTitle.toLowerCase() === 'find tickets') {
                    const hiddenTextLoc = item.locator('a[data-testid="event-list-link"] .VisuallyHidden-sc-8buqks-0, button[aria-controls="eventOverflow"] .VisuallyHidden-sc-8buqks-0').last();
                    if (await hiddenTextLoc.count() > 0) {
                        const rawHidden = await hiddenTextLoc.innerText();
                        rawTitle = rawHidden.split(',')[0].replace(/Open additional information for/i, '').trim();
                    }
                }

                if (!rawTitle || rawTitle.toLowerCase() === 'find tickets') continue;

                let constructedDateStr = "";
                const hiddenDateLoc = item.locator('span.VisuallyHidden-sc-8buqks-0 span').first();
                if (await hiddenDateLoc.count() > 0) {
                    constructedDateStr = await hiddenDateLoc.innerText();
                }

                // Ticketmaster's class names (bZWmdt, fCBXcp...) change often, so read the time from the
                // card's full text instead. Remove the title first so times inside a title
                // (e.g. "Check In By 1:30pm") aren't mistaken for the start time.
                let rawTime = "TBA";
                const cardText = ((await item.textContent()) || '').replace(/\s+/g, ' ');
                const textWithoutTitle = cardText.split(rawTitle).join(' ');
                const cardTimeMatch =
                    textWithoutTitle.match(/(?:•|·|\bat\b)\s*(\d{1,2}:\d{2}\s*[AP]\.?M\.?)/i) ||
                    textWithoutTitle.match(/\b(\d{1,2}:\d{2}\s*[AP]\.?M\.?)/i);
                if (cardTimeMatch) {
                    rawTime = cardTimeMatch[1].replace(/\./g, '');
                }

                const cleanDate = formatDate(constructedDateStr);
                const timeMatch = rawTime.match(/\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)/i);
                const cleanTime = formatTime(timeMatch ? timeMatch[0] : 'TBA');
                
                const eventType = categorizeEnmarket(rawTitle);
                const finalTitle = toTitleCase(rawTitle.replace(/\s+/g, ' ').trim());

                const dedupeKey = `${cleanDate}-${cleanTime}-${finalTitle}`;
                if (seenEvents.has(dedupeKey)) continue;
                seenEvents.add(dedupeKey);

                if (cleanDate !== 'TBA' && new Date(cleanDate) < today) continue;

                venueData.push({
                    venue: 'Enmarket Arena',
                    title: finalTitle,
                    date: cleanDate,
                    time: cleanTime,
                    type: eventType
                });

                console.log(`✅ Kept: ${finalTitle} on ${cleanDate} (${cleanTime}) [${eventType}]`);

            } catch (innerErr) {
                continue;
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

// =========================================================================
// 2. MARYLAND - XFINITY CENTER (ATHLETICS CALENDAR)
// =========================================================================
function mapMarylandSportType(sportCode, fullText) {
    const code = (sportCode || "").toUpperCase().trim();
    const text = (fullText || "").toLowerCase();

    if (code === 'MBB' || text.includes("men's basketball")) {
        return 'NCAA MB';
    }
    if (code === 'WBB' || text.includes("women's basketball")) {
        return 'NCAA WB';
    }
    if (code === 'VB' || code === 'WVB' || text.includes('volleyball')) {
        return 'NCAA WVB';
    }
    if (text.includes('concert') || text.includes('live in')) {
        return 'Concert';
    }
    
    // MSOC, WLAX, T&F, Wrestling, Gymnastics -> Other
    return 'Other';
}

// Scrape Maryland - Xfinity Center events from the athletics calendar
 // Scrape Maryland - Xfinity Center events from the athletics calendar

async function scrapeXfinityS(browser) {

    const context = await browser.newContext({

        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',

        viewport: { width: 1366, height: 768 }

    });

    const page = await context.newPage();

    await setupTranscendKiller(page);


    let venueData = [];

    const today = new Date();

    today.setHours(0, 0, 0, 0);


    try {

        console.log(`\n🚀 Navigating to Maryland Xfinity Calendar...`);

        await page.goto('https://umterps.com/calendar', { waitUntil: 'domcontentloaded', timeout: 30000 });

        await page.waitForSelector('.fc-daygrid-body', { timeout: 15000 });


        for (let m = 0; m < 12; m++) {

            await page.waitForSelector('.fc-daygrid-day', { timeout: 10000 });

            const monthText = await page.locator('.fc-toolbar-title').first().innerText();

            console.log(`📅 Processing layout grid for: ${monthText}`);


            await page.evaluate(() => {

                document.querySelectorAll('.fc-daygrid-more-link').forEach(link => {

                    if (link instanceof HTMLElement) link.click();

                });

            });

            await page.waitForTimeout(1000);


            const eventsInGrid = page.locator('td.fc-daygrid-day:not(.fc-day-other) .fc-daygrid-event, td.fc-daygrid-day:not(.fc-day-other) .fc-daygrid-dot-event');

            const totalEvents = await eventsInGrid.count();


            for (let i = 0; i < totalEvents; i++) {

                if (page.isClosed()) break;


                try {

                    const currentEvent = eventsInGrid.nth(i);

                    await currentEvent.waitFor({ state: 'visible', timeout: 3000 });

                    await currentEvent.scrollIntoViewIfNeeded();


                    const parentCell = currentEvent.locator('xpath=ancestor::td[contains(@class, "fc-daygrid-day")]');

                    const cleanDate = await parentCell.getAttribute('data-date');


                    await currentEvent.click({ force: true });

                    await page.waitForTimeout(800);


                    const dialogContainer = page.locator('[role="dialog"], .fc-popover, .fc-popover-body').last();

                    

                    // Split the popup into one block per game WITHOUT relying on card class names.
                    // Each game has one sport header; for each header, climb up the page until we
                    // reach the biggest wrapper that still holds only that one game. Everything
                    // (location, opponent, time) is then read from inside that wrapper, so a
                    // multi-game day can't mix one game's location with another game.
                    // On a single-game day the wrapper is the whole popup, same as before.
                    const games = await dialogContainer.evaluate((dialog) => {
                        const HEADER_SEL = '[data-test-id="s-game-card-standard__header-sport-name"], .s-game-card__header-sport-name';
                        // Matches the site's markup:
                        //   <a data-test-id="s-game-card-facility-and-location__game-facility-title-link"
                        //      href="/facilities/xfinity-center/8">XFINITY Center</a>
                        //   <span data-test-id="s-game-card-facility-and-location__standard-location-details">College Park, MD</span>
                        const FACILITY_SEL = '[data-test-id="s-game-card-facility-and-location__game-facility-title-link"], ' +
                                             '[data-test-id="s-game-card-facility-and-location__standard-facility-title"], ' +
                                             'a[href*="/facilities/"]';
                        const DETAILS_SEL = '[data-test-id="s-game-card-facility-and-location__standard-location-details"]';

                        // One anchor per game: sport headers, or the location lines if headers aren't found
                        let anchorSel = HEADER_SEL;
                        let anchors = Array.from(dialog.querySelectorAll(HEADER_SEL));
                        if (anchors.length <= 1) {
                            anchorSel = DETAILS_SEL;
                            anchors = Array.from(dialog.querySelectorAll(DETAILS_SEL));
                        }
                        let blocks;
                        if (anchors.length <= 1) {
                            blocks = [dialog];
                        } else {
                            blocks = anchors.map(a => {
                                let block = a;
                                while (block.parentElement && block.parentElement !== dialog &&
                                       block.parentElement.querySelectorAll(anchorSel).length === 1) {
                                    block = block.parentElement;
                                }
                                return block;
                            });
                        }

                        return blocks.map(block => {
                            const text = sel => {
                                const el = block.querySelector(sel);
                                return el ? (el.innerText || el.textContent || '').trim() : '';
                            };
                            const facilityEl = block.querySelector(FACILITY_SEL);
                            const facility = facilityEl ? (facilityEl.textContent || '').trim() : '';
                            const facilityHref = facilityEl ? (facilityEl.getAttribute('href') || '') : '';
                            const city = text(DETAILS_SEL);
                            const timeEl = block.querySelector('[aria-label="Event Time"]');
                            return {
                                facility,
                                facilityHref,
                                city,
                                sport: text('[data-test-id="s-game-card-standard__header-sport-name"] span, .s-game-card__header-sport-name span, .slot-event-item span:nth-child(3)'),
                                opponent: text('[data-test-id="s-game-card-standard__header-team-opponent-link"], a[href*="/opponent/"]'),
                                altTitle: text('.s-game-card__header__team-event-info p, h2, h3'),
                                rawTime: timeEl ? (timeEl.textContent || '') : ''
                            };
                        });
                    });

                    for (const game of games) {
                        // LOCATION CHECK: the city must be exactly "College Park, MD", and the venue must be
                        // XFINITY Center or left blank (home games like MBB vs. #9 Virginia show an empty
                        // venue and only "College Park, MD"). A named venue that isn't Xfinity (SECU Stadium,
                        // Ludwig Field, Bob "Turtle" Smith Stadium...) is rejected, and so is
                        // "College Park, MD / GrillMarX" (watch parties).
                        const facilityName = (game.facility || '').trim();
                        const isXfinityFacility =
                            /xfinity center/i.test(facilityName) || /\/facilities\/xfinity-center\b/i.test(game.facilityHref);
                        const noFacilityListed = !facilityName && !game.facilityHref;
                        const isCollegePark = /^college park,?\s*(md|maryland)\.?$/i.test((game.city || '').trim());

                        if (!(isCollegePark && (isXfinityFacility || noFacilityListed))) {
                            console.log(`   ⏭️ Skipped (not Xfinity): ${cleanDate} @ ${game.facility || 'no facility'}, ${game.city || 'no city'}`);
                            continue;
                        }

                        let rawSportCode = game.sport;
                        if (!rawSportCode) {
                            const inlineNodeText = await currentEvent.innerText();
                            const matchCode = inlineNodeText.match(/(MBB|WBB|WLAX|T&F|FB|WVB|VB|BASE|SB|MSOC|WSOC)/i);
                            if (matchCode) rawSportCode = matchCode[0];
                        }

                        let opponentTitle = game.opponent || game.altTitle || await currentEvent.innerText();

                        let cleanOpp = opponentTitle.replace(/\s+/g, ' ').replace(/^(vs\.|at)/i, '').trim();
                        if (cleanOpp.includes("Events") || cleanOpp.includes("Calendar") || cleanOpp.includes("Xfinity")) {
                            cleanOpp = "Competition";
                        }

                        const eventType = mapMarylandSportType(rawSportCode, `${rawSportCode} ${cleanOpp}`);
                        const finalTitle = toTitleCase(`Maryland vs. ${cleanOpp}`);

                        const timeMatch = game.rawTime.match(/\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)/i);
                        const cleanTime = formatTime(timeMatch ? timeMatch[0].toUpperCase() : 'TBA');
                        const eventDate = new Date(cleanDate);

                        if (eventDate >= today) {
                            venueData.push({
                                venue: 'Maryland - Xfinity Center',
                                title: finalTitle,
                                date: cleanDate,
                                time: cleanTime,
                                type: eventType
                            });
                            console.log(`✅ Kept: ${finalTitle} on ${cleanDate} (${cleanTime}) [${eventType}]`);
                        }
                    }

                    const closeBtn = dialogContainer.locator('button:has-text("Close"), button.fc-popover-close, .close').first();

                    if (await closeBtn.count() > 0 && await closeBtn.isVisible()) {

                        await closeBtn.click();

                        await page.waitForTimeout(300);

                    } else {

                        await page.keyboard.press('Escape').catch(() => {});

                        await page.waitForTimeout(300);

                    }

                } catch (innerErr) {

                    await page.keyboard.press('Escape').catch(() => {});

                    await page.waitForTimeout(300);

                }

            }


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
// =========================================================================
// 3. ALLIANZ FIELD
// =========================================================================
function parseDateTimeAllianz(rawText) {
    if (!rawText) return { date: 'TBA', time: 'TBA' };

    const monthMap = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
    };

    const dateMatch = rawText.match(/([A-Za-z]+)\s+(\d+),\s+(\d{4})/i);
    let dateISO = 'TBA';
    if (dateMatch) {
        const month = monthMap[dateMatch[1].toLowerCase().substring(0, 3)];
        const day = dateMatch[2].padStart(2, '0');
        const year = dateMatch[3];
        if (month) dateISO = `${year}-${month}-${day}`;
    }

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

function categorizeAllianz(title, categoriesText) {
    const combined = `${title} ${categoriesText}`.toLowerCase();

    if (combined.includes('mnufc 2') || combined.includes('mls next pro')) return 'MLS Next Pro';
    if (combined.includes('nwsl') || combined.includes('aurora')) return 'NWSL';
    if (combined.includes('mnufc') || combined.includes('mls') || combined.includes('leagues cup') || combined.includes('minnesota united')) return 'MLS';

    const musicKeywords = ['concert', 'tour', 'album', 'live in', 'yacht rock', 'gramm', 'band', 'presents'];
    if (musicKeywords.some(kw => combined.includes(kw)) && !combined.includes('tournament')) {
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
        console.log("\n🚀 Scraping Allianz Field Calendar...");
        await page.goto('https://www.allianzfield.com/events', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);
        await page.waitForSelector('.event_items.w-dyn-item', { timeout: 15000 }).catch(() => {});

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

        console.log(`📋 Found ${rawEvents.length} Allianz Field event cards.`);
        const today = new Date();
        today.setHours(0,0,0,0);

        for (const ev of rawEvents) {
            const { date: cleanDate, time: cleanTime } = parseDateTimeAllianz(ev.dateTimeStr);
            const eventType = categorizeAllianz(ev.title, ev.categories);

            if (cleanDate !== 'TBA' && new Date(cleanDate) < today) continue;

            const finalTitle = toTitleCase(ev.title.trim());

            venueData.push({
                venue: 'Allianz Field',
                title: finalTitle,
                date: cleanDate,
                time: cleanTime,
                type: eventType
            });

            console.log(`✅ Kept: ${finalTitle} on ${cleanDate} (${cleanTime}) [${eventType}]`);
        }
    } catch (err) {
        console.log("❌ Allianz Field scraping error:", err.message);
    } finally {
        await page.close();
        await context.close();
    }

    return venueData;
}

// =========================================================================
// 4. LSU - PMAC
// Scrapes the lsusports.net schedule pages and keeps only events at
// "Baton Rouge, La. (Maravich Center)".
// =========================================================================
const LSU_SCHEDULES = [
    { url: 'https://lsusports.net/sports/mb/schedule',     type: 'NCAA MB' },
    { url: 'https://lsusports.net/sports/wbball/schedule', type: 'NCAA WB' },
    { url: 'https://lsusports.net/sports/vb/schedule',     type: 'NCAA WVB' },
    { url: 'https://lsusports.net/sports/fb/schedule',     type: 'NCAA Football' },
    { url: 'https://lsusports.net/sports/gm/schedule',     type: 'Other' }   // Gymnastics
];

// Concerts listed on a schedule page are tagged Concert; everything else uses the sport's type
function categorizeLSUEvent(title, sportType) {
    const t = (title || "").toLowerCase();
    if (/\b(concert|tour|live in concert)\b/.test(t)) return 'Concert';
    return sportType || 'Other';
}

// "Nov 6" has no year: Jul-Dec belong to the season's first year, Jan-Jun to the next year
function lsuSeasonDate(monthDay) {
    const monthMap = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const m = (monthDay || '').match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})/);
    if (!m) return 'TBA';
    const month = monthMap[m[1].toLowerCase()];
    if (!month) return 'TBA';
    const now = new Date();
    const seasonStartYear = now.getMonth() + 1 >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    const year = month >= 7 ? seasonStartYear : seasonStartYear + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
}

async function scrapeLSU(browser) {
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

    console.log(`\n🚀 Scraping LSU Pete Maravich Assembly Center (PMAC) from lsusports.net...`);

    for (const sched of LSU_SCHEDULES) {
        let kept = 0, notPmac = 0, past = 0;
        try {
            await page.goto(sched.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
            await page.waitForSelector('.schedule-event-item__top', { timeout: 20000 });

            // Scroll so every game in the season renders
            let lastCount = -1;
            for (let i = 0; i < 10; i++) {
                const count = await page.locator('.schedule-event-item__top').count();
                if (count === lastCount) break;
                lastCount = count;
                await page.mouse.wheel(0, 5000);
                await page.waitForTimeout(800);
            }

            const rawEvents = await page.evaluate(() => {
                const clean = s => (s || '').replace(/\s+/g, ' ').trim();
                return Array.from(document.querySelectorAll('.schedule-event-item__top')).map(top => {
                    const item = top.closest('[class*="schedule-event-item"]:not(.schedule-event-item__top)') || top.parentElement || top;

                    const monthDay = clean(top.querySelector('.schedule-event-item__date-box .schedule-event-date__month-day, .schedule-event-date__month-day')?.textContent);

                    // Opponent: last span inside the name (the first child is the "vs."/"at" label)
                    const nameEl = top.querySelector('.schedule-default-event__name');
                    let opponent = '';
                    if (nameEl) {
                        const spans = nameEl.querySelectorAll(':scope > span');
                        opponent = clean(spans.length ? spans[spans.length - 1].textContent : nameEl.textContent);
                        opponent = opponent.replace(/^(vs\.?|at)\s+/i, '');
                    }
                    const divider = clean(top.querySelector('.schedule-default-event__divider')?.textContent);

                    const location = clean(
                        top.querySelector('.schedule-event-item__location')?.textContent ||
                        top.querySelector('.schedule-event-location')?.textContent ||
                        item.querySelector('.schedule-event-location')?.textContent
                    );

                    const result = clean(top.querySelector('.schedule-event-item-result__label, .schedule-event-item-result')?.textContent);

                    return { monthDay, opponent, divider, location, result };
                });
            });

            for (const ev of rawEvents) {
                // Only games at the Maravich Center
                if (!/maravich center/i.test(ev.location)) { notPmac++; continue; }

                // Past games show a score ("W, 85-60") instead of a time
                const isScore = /\b[WLT]\b|\d+\s*-\s*\d+|final/i.test(ev.result) && !/\d{1,2}(:\d{2})?\s*[AP]\.?M/i.test(ev.result);
                if (isScore) { past++; continue; }

                const cleanDate = lsuSeasonDate(ev.monthDay);
                if (cleanDate !== 'TBA') {
                    const [y, mo, d] = cleanDate.split('-').map(Number);
                    if (new Date(y, mo - 1, d) < today) { past++; continue; }
                }

                const timeMatch = ev.result.match(/\d{1,2}(?::\d{2})?\s*[AP]\.?M\.?/i);
                const cleanTime = timeMatch ? formatTime(timeMatch[0]) : 'TBA';

                const opponent = ev.opponent || 'TBA';
                const finalTitle = `LSU Tigers vs. ${opponent}`;
                const eventType = categorizeLSUEvent(finalTitle, sched.type);

                const dedupeKey = `${cleanDate}-${finalTitle}`;
                if (seenEvents.has(dedupeKey)) continue;
                seenEvents.add(dedupeKey);

                venueData.push({
                    venue: 'LSU - PMAC',
                    title: finalTitle,
                    date: cleanDate,
                    time: cleanTime,
                    type: eventType
                });
                kept++;
                console.log(`✅ Kept: ${finalTitle} on ${cleanDate} (${cleanTime}) [${eventType}]`);
            }

            console.log(`📋 LSU ${sched.type}: ${rawEvents.length} on schedule, ${kept} kept, ${notPmac} not at PMAC, ${past} past.`);
        } catch (err) {
            console.error(`❌ LSU ${sched.type} (${sched.url}) failed:`, err.message);
        }
    }

    console.log(`🏁 LSU PMAC total: ${venueData.length} events.`);
    await page.close();
    await context.close();
    return venueData;
}

// =========================================================================
// MAIN EXECUTION
// =========================================================================
(async () => {
    const browser = await chromium.launch({ headless: false });

    console.log("🏁 Starting Crawler 4 Suite Execution...");

    // Run a single scraper while debugging, e.g.:  ONLY=xfinity node crawler-4.js
    const scrapers = {
        enmarket: scrapeEnmarket,
        xfinity: scrapeXfinityS,
        allianz: scrapeAllianzField,
        lsu: scrapeLSU
    };
    const only = (process.env.ONLY || '').toLowerCase();
    const toRun = only ? [scrapers[only]].filter(Boolean) : Object.values(scrapers);

    const results = await Promise.all(toRun.map(fn => fn(browser)));

    const allData = results.flat();

    // Global Deduplication across all 4 venues
    const uniqueData = [];
    const seenEntries = new Set();

    for (const item of allData) {
        const dedupeKey = `${item.venue}|${item.title}|${item.date}|${item.type}`;
        if (!seenEntries.has(dedupeKey)) {
            seenEntries.add(dedupeKey);
            uniqueData.push(item);
        }
    }

    console.log(`\n🏁 Total unique events scraped: ${uniqueData.length}`);

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

    if (uniqueData.length > 0) {
        await csvWriter.writeRecords(uniqueData);
        console.log('💾 Done! All events cleanly formatted & saved to calendar-4.csv');
    } else {
        console.log('⚠️ No records to write.');
    }

    await browser.close();
})();