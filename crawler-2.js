const { chromium } = require('playwright');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

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

// Get academic year based on current date
function getAcademicYear() {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    if (currentMonth >= 8) {
        return { firstHalf: currentYear, secondHalf: currentYear + 1 };
    } else {
        return { firstHalf: currentYear - 1, secondHalf: currentYear };
    }
}

// Determine which year a month falls into based on academic calendar
function getYearForMonth(monthStr) {
    const academicYear = getAcademicYear();
    if (monthStr === 'oct' || monthStr === 'nov' || monthStr === 'dec') {
        return academicYear.firstHalf;
    } else {
        return academicYear.secondHalf;
    }
}

// Format time to 12:00AM or 12:00PM (no space)
function formatTime(timeStr) {
    if (!timeStr || timeStr === 'TBA') {
        return 'TBA';
    }

    timeStr = timeStr.replace(/@/g, '').replace(/\s*(AM|PM|am|pm)/i, (match, ampm) => ampm.toUpperCase().trim());

    if (/^\d+(?:AM|PM)$/i.test(timeStr)) {
        timeStr = timeStr.replace(/(\d+)/, '$1:00');
    }

    return timeStr.trim();
}

function formatSimpleDate(monthStr, dayStr) {
    const monthMap = {
        'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04',
        'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08',
        'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
    };
    const month = monthMap[(monthStr || '').toUpperCase().substring(0, 3)] || '01';
    const day = (dayStr || '01').padStart(2, '0');
    return `2026-${month}-${day}`;
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

// Transcend / Anti-Bot Overlay Killer
async function setupTranscendKiller(page) {
    await page.addInitScript(() => {
        const kill = () => {
            const host = document.querySelector('#transcend-consent-manager, #iubenda-cs-banner, .iubenda-cs-default, .satisfi_btn, .satisfi_container, #satisfi_chat_container');
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
        if (
            u.includes('transcend-cdn.com') || 
            u.includes('transcend.io') || 
            u.includes('iubenda.com') ||
            ['image', 'media', 'font'].includes(type)
        ) {
            return route.abort();
        }
        return route.continue();
    });
}

//========================================
// CATEGORIZATION FUNCTIONS

function categorizeJBJ(sport, title) {
    const s = (sport || '').toLowerCase();
    const t = (title || '').toLowerCase();
    if (s.includes('basketball')) {
        return s.includes('women') ? 'NCAA WB' : 'NCAA MB';
    }
    if (s.includes('wrestling')) return 'Wrestling';
    if (t.includes('concert') || t.includes('tour')) return 'Concert';
    return 'Other';
}

function categorizeVT(btnText, opponent) {
    const text = ((btnText || '') + " " + (opponent || '')).toUpperCase();
    if (text.includes("WOMEN'S BASKETBALL")) return 'NCAA WB';
    if (text.includes("MEN'S BASKETBALL")) return 'NCAA MB';
    if (text.includes('VOLLEYBALL')) return 'NCAA WVB';
    if (text.includes('WRESTLING') || text.includes('ACC CHAMPIONSHIPS')) return 'Wrestling';
    if (text.includes('CONCERT')) return 'Concert';
    return 'Other';
}

function categorizeBJC(title, intro, subtitle) {
    const fullText = `${title || ''} ${intro || ''} ${subtitle || ''}`.toLowerCase();
    if (fullText.includes('penn state vs.') || fullText.includes('basketball') || fullText.includes('mbb')) {
        return 'NCAA MB';
    }
    if (fullText.includes('wrestling')) return 'Wrestling';
    if (fullText.includes('tour') || fullText.includes('live') || fullText.includes('presents') || fullText.includes('concert')) {
        if (fullText.includes('monster truck')) return 'Other';
        return 'Concert';
    }
    return 'Other';
}

function categorizeRSL(compText) {
    const comp = (compText || "").toLowerCase();
    if (comp.includes('next pro') || comp.includes('monarchs')) return 'MLS Next Pro';
    if (comp.includes('nwsl') || comp.includes('royals')) return 'NWSL';
    if (comp.includes('mls') || comp.includes('leagues cup') || comp.includes('us open cup') || comp.includes('champions cup')) return 'MLS';
    return 'Other';
}

function categorizeAmericaFF(title, description) {
    const t = ((title || '') + " " + (description || '')).toLowerCase();
    if (t.includes('real salt lake') || t.includes('rsl')) return 'MLS';
    if (t.includes('utah royals')) return 'NWSL';
    if (t.includes('real monarchs')) return 'MLS Next Pro';
    if (t.includes('concert') || t.includes('tour')) return 'Concert';
    return 'Other';
}

function categorizeRSLW(title) {
    const t = (title || '').toLowerCase();
    if (t.includes('real salt lake') || t.includes('rsl')) return 'MLS';
    if (t.includes('utah royals')) return 'NWSL';
    if (t.includes('real monarchs')) return 'MLS Next Pro';
    if (t.includes('concert') || t.includes('tour')) return 'Concert';
    return 'Other';
}

function categorizeAndAssignTime(title) {
    const t = (title || '').toLowerCase();
    if (t.includes('tour') || t.includes('yellowcard') || t.includes('kahan') || t.includes('souls')) {
        return { type: 'Concert', time: '7:00 PM' };
    }
    if (t.includes('breakaway') || t.includes('nation') || t.includes('homecoming')) {
        return { type: 'Other', time: '6:00 PM' };
    }
    return { type: 'Other', time: 'TBA' };
}

// ======================================================================================
// VENUE SCRAPERS

// 1. John Paul Jones Arena
async function scrapeJPJ(browser) {
    const page = await browser.newPage();
    const venueData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        console.log(`\nScraping John Paul Jones Arena...`);
        await setupTranscendKiller(page);

        await page.goto('https://virginiasports.com/all-sports-schedule?type=home', { 
            waitUntil: 'networkidle', 
            timeout: 45000 
        });

        // Dismiss any cookie overlays
        try {
            const cookieBtn = page.locator('.iubenda-cs-accept-btn, button:has-text("Accept")').first();
            if (await cookieBtn.isVisible({ timeout: 3000 })) await cookieBtn.click();
            await page.addStyleTag({ content: '#iubenda-cs-banner, .iubenda-cs-default, .iubenda-cs-overlay { display: none !important; }' });
        } catch (e) {}

        const cardSelector = '.schedule-event-item, .c-schedule__item, tr.c-schedule-table__row';
        await page.waitForSelector(cardSelector, { timeout: 15000 }).catch(() => {});

        // Load more rows
        let hasMore = true;
        let attempts = 0;
        while (hasMore && attempts < 10) {
            const btn = page.locator('button.load-more, .schedule__load-more-button, button:has-text("Load More")').first();
            if (await btn.isVisible({ timeout: 2500 })) {
                await btn.scrollIntoViewIfNeeded();
                await btn.click({ force: true }).catch(() => {});
                await page.waitForTimeout(1500);
                attempts++;
            } else {
                hasMore = false;
            }
        }

        const rows = await page.locator(cardSelector).all();
        console.log(`Processing ${rows.length} JPJ schedule rows...`);

        for (const row of rows) {
            try {
                // 1. Sport check (Basketball & Wrestling play in JPJ Arena)
                const sportLoc = row.locator('.schedule-event-item-links__sport-name, .schedule-default-event__sport, .sport-name').first();
                const sportClean = (await sportLoc.count() > 0) ? (await sportLoc.innerText()).trim() : "";

                const jpjSports = ["Men's Basketball", "Women's Basketball", "Wrestling", "MBB", "WBB"];
                const isJPJSport = jpjSports.some(s => sportClean.toLowerCase().includes(s.toLowerCase()));

                if (!isJPJSport && sportClean !== "") continue;

                // 2. Opponent
                const opponentLoc = row.locator('.schedule-default-event__opponent-name, .schedule-default-event__name, .opponent-name').first();
                const opponent = (await opponentLoc.count() > 0) ? await opponentLoc.innerText() : "Opponent TBD";

                // 3. Date (Using dynamic getYearForMonth: Fall = 2026, Spring = 2027)
                const dateLoc = row.locator('.schedule-event-date__month-day, .event-date, time').first();
                if (await dateLoc.count() === 0) continue;
                const dateVal = (await dateLoc.innerText()).trim();

                const monthStr = dateVal.toLowerCase().substring(0, 3);
                const year = getYearForMonth(monthStr);
                const cleanDate = formatDate(`${dateVal} ${year}`);

                // 4. Time
                let timeVal = 'TBA';
                const timeLabel = row.locator('.schedule-event-item-result__label, .schedule-event-date__time, .event-time').first();
                if (await timeLabel.count() > 0) {
                    const rawTime = await timeLabel.innerText();
                    const match = rawTime.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/i);
                    if (match) timeVal = formatTime(match[1]);
                }

                // Filter past events
                if (cleanDate !== "TBA" && new Date(cleanDate) < today) {
                    continue;
                }

                const finalTitle = `VIRGINIA VS. ${cleanOpponent(opponent).toUpperCase()} (${sportClean.toUpperCase() || 'EVENT'})`;

                venueData.push({
                    venue: 'John Paul Jones Arena',
                    title: finalTitle,
                    date: cleanDate,
                    time: timeVal,
                    type: categorizeJBJ(sportClean, opponent)
                });

                console.log(`✅ Kept: ${finalTitle} on ${cleanDate} (${timeVal})`);
            } catch (e) { continue; }
        }
    } catch (e) { console.log(`❌ John Paul Jones Arena failed: ${e.message}`); }
    await page.close();
    return venueData;
}

// 2. Virginia Tech - Cassell Coliseum
async function scrapeVT(browser) {
    const page = await browser.newPage();
    const venueData = [];
    const monthsToScrape = 12;
    const currentYear = new Date().getFullYear();
    const targetStartMonth = `January ${currentYear}`;
    const today = new Date().toISOString().split('T')[0];

    try {
        console.log(`\nScraping Virginia Tech - Cassell Coliseum...`);
        await page.goto('https://hokiesports.com/all-sports-schedule?view=calendar&type=home', { waitUntil: 'domcontentloaded', timeout: 35000 });

        try {
            const acceptBtn = page.getByRole('button', { name: 'Accept' });
            if (await acceptBtn.isVisible({ timeout: 3000 })) await acceptBtn.click();
        } catch(e) {}

        const header = page.locator('.schedule-calendar-navigation__month').first();
        if (await header.count() > 0) {
            let monthYearText = await header.innerText();
            let safetyCounter = 0;

            while (!monthYearText.includes(targetStartMonth) && safetyCounter < 12) {
                const currentMonthIndex = new Date(Date.parse(monthYearText.split(' ')[0] + " 1, 2012")).getMonth();
                const navBtn = currentMonthIndex > 0
                    ? page.locator('.schedule-calendar-navigation__button').first()
                    : page.locator('.schedule-calendar-navigation__button').last();

                await navBtn.dispatchEvent('click');
                await page.waitForTimeout(800);
                monthYearText = await header.innerText();
                safetyCounter++;
            }

            for (let i = 0; i < monthsToScrape; i++) {
                monthYearText = await header.innerText();
                await page.waitForSelector('.schedule-calendar-event', { timeout: 4000 }).catch(() => {});

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
                            const locationLoc = details.locator('.schedule-event-location');
                            if (await locationLoc.count() === 0) continue;
                            const location = await locationLoc.innerText();
                            if (!location.includes('Cassell Coliseum')) continue;

                            const teamLocators = details.locator('.schedule-calendar-event-details-teams__team-name');
                            const teamCount = await teamLocators.count();
                            let opponent = teamCount > 1 ? await teamLocators.nth(1).innerText() : await teamLocators.first().innerText();

                            if (opponent.includes('Tech Talk Live') || opponent.includes('Hokie Sports Weekly')) continue;

                            const btnText = await event.locator('.schedule-calendar-event__button').innerText();
                            const eventType = categorizeVT(btnText, opponent);

                            let finalTime = "TBA";
                            const timeMatch = btnText.match(/(\d{1,2}(?::\d{2})?\s*(?:PM|AM))/i);
                            if (timeMatch) finalTime = timeMatch[1];

                            venueData.push({
                                venue: 'Virginia Tech - Cassell Coliseum',
                                title: `Virginia Tech vs. ${opponent} (${btnText.split('-')[1]?.trim() || 'Event'})`,
                                date: cleanDate,
                                time: formatTime(finalTime),
                                type: eventType
                            });
                        } catch (e) { continue; }
                    }
                }

                const nextBtn = page.locator('.schedule-calendar-navigation__button').last();
                await nextBtn.dispatchEvent('click');
                await page.waitForTimeout(800);
            }
        }
    } catch (e) { console.log(`Virginia Tech - Cassell Coliseum failed: ${e.message}`); }
    await page.close();
    return venueData;
}

// 3. Bryce Jordan Center
async function scrapeBJC(browser) {
    const page = await browser.newPage();
    const venueData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        console.log(`\n🚀 Scraping Bryce Jordan Center (BJC)...`);
        await page.goto('https://bjc.psu.edu/upcoming-events', { waitUntil: 'domcontentloaded', timeout: 30000 });

        await page.addStyleTag({ content: '.satisfi_btn, .satisfi_container, #satisfi_chat_container { display: none !important; }' });
        await page.waitForTimeout(2000);
        await page.waitForSelector('.list-wrapper', { timeout: 15000 });

        const rawEvents = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('.list-wrapper');

            cards.forEach(card => {
                const titleEl = card.querySelector('.event-title a, .event-title');
                const introEl = card.querySelector('.event-intro-title');
                const subEl = card.querySelector('.event-sub-title');

                const title = titleEl ? titleEl.innerText.trim() : "";
                const intro = introEl ? introEl.innerText.trim() : "";
                const subtitle = subEl ? subEl.innerText.trim() : "";
                const dateTimeEl = card.querySelector('.date-time');
                const rawDateTime = dateTimeEl ? dateTimeEl.innerText.trim() : "";

                if (title || intro) {
                    results.push({ title, intro, subtitle, rawDateTime });
                }
            });
            return results;
        });

        const seenEvents = new Set();
        for (const ev of rawEvents) {
            let finalTitle = ev.title;
            if (ev.intro && !finalTitle.toLowerCase().includes(ev.intro.toLowerCase())) {
                finalTitle = `${ev.title} - ${ev.intro}`;
            }
            finalTitle = finalTitle.replace(/\s+/g, ' ').trim().toUpperCase();

            let cleanDate = "TBA";
            let cleanTime = "TBA";

            const dateMatch = ev.rawDateTime.match(/\b([A-Za-z]+)\.?\s+(\d{1,2}),?\s*(\d{4})?/i);
            if (dateMatch) {
                const month = dateMatch[1];
                const day = dateMatch[2];
                const year = dateMatch[3] || '2026';
                cleanDate = formatDate(`${month} ${day} ${year}`);
            }

            const timeMatch = ev.rawDateTime.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i);
            if (timeMatch) cleanTime = formatTime(timeMatch[1]);

            if (cleanDate !== "TBA" && new Date(cleanDate) < today) continue;

            const dedupeKey = `${cleanDate}-${cleanTime}-${finalTitle}`;
            if (seenEvents.has(dedupeKey)) continue;
            seenEvents.add(dedupeKey);

            const eventType = categorizeBJC(ev.title, ev.intro, ev.subtitle);
            venueData.push({
                venue: 'Penn State: Bryce Jordan Center',
                title: finalTitle,
                date: cleanDate,
                time: cleanTime,
                type: eventType
            });
            console.log(`✅ Kept: ${finalTitle} on ${cleanDate} (${cleanTime}) [${eventType}]`);
        }
    } catch (e) { console.log(`❌ Bryce Jordan Center failed: ${e.message}`); }
    await page.close();
    return venueData;
}

// 4. Real Salt Lake (America First Field)
async function scrapeRSL(browser) {
    const page = await browser.newPage();
    const venueData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString().split('T')[0];

    try {
        console.log(`\n🚀 Scraping Real Salt Lake (Anchored to ${todayISO})...`);
        await page.goto(`https://www.rsl.com/schedule/#competition=all&date=${todayISO}`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        await page.waitForSelector('.mls-c-match-list__match, .mls-c-match-list__match-container', { timeout: 15000 });
        await page.waitForTimeout(2000);

        const rawMatches = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('.mls-c-match-list__match-container, .mls-c-match-list__match');

            cards.forEach(card => {
                const matchLink = card.querySelector('a[href*="/matches/"]');
                const href = matchLink ? matchLink.href : "";

                let urlDate = "";
                const urlDateMatch = href.match(/(\d{2})-(\d{2})-(\d{4})/);
                if (urlDateMatch) {
                    const month = urlDateMatch[1];
                    const day = urlDateMatch[2];
                    const year = urlDateMatch[3];
                    urlDate = `${year}-${month}-${day}`;
                }

                const homeClubEl = card.querySelector('.mls-c-club.--home .mls-c-club__shortname, .mls-c-club.--home .mls-c-club__name');
                const awayClubEl = card.querySelector('.mls-c-club.--away .mls-c-club__shortname, .mls-c-club.--away .mls-c-club__name');
                
                const homeTeam = homeClubEl ? homeClubEl.innerText.trim() : "Real Salt Lake";
                const awayTeam = awayClubEl ? awayClubEl.innerText.trim() : "Opponent TBD";
                const statusEl = card.querySelector('.mls-c-status-stamp__status');
                const statusText = statusEl ? statusEl.innerText.trim() : "";
                const scorebugEl = card.querySelector('.mls-c-scorebug');
                const scorebugText = scorebugEl ? scorebugEl.innerText.trim() : "";

                const infoParagraphs = card.querySelectorAll('.mls-c-match-list__match-info p');
                let competition = "";
                let venue = "";

                if (infoParagraphs.length > 0) {
                    competition = infoParagraphs[0].innerText.trim();
                    venue = infoParagraphs[infoParagraphs.length - 1].innerText.trim();
                }

                if (homeTeam && href) {
                    results.push({ urlDate, statusText, scorebugText, homeTeam, awayTeam, competition, venue, href });
                }
            });
            return results;
        });

        const seenEvents = new Set();
        for (const match of rawMatches) {
            const venueLower = match.venue.toLowerCase();
            const isAmericaFirstField = venueLower.includes('america first field') || 
                                        venueLower.includes('riot') || 
                                        venueLower.includes('rio tinto') ||
                                        match.homeTeam.toLowerCase().includes('salt lake');

            if (!isAmericaFirstField) continue;

            let cleanDate = match.urlDate || "TBA";
            let cleanTime = "TBA";
            const timeMatch = (match.statusText + " " + match.scorebugText).match(/\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)/i);
            if (timeMatch) cleanTime = formatTime(timeMatch[0]);

            if (cleanDate !== "TBA" && new Date(cleanDate) < today) continue;

            const cleanType = categorizeRSL(match.competition);
            const eventTitle = `${match.homeTeam.toUpperCase()} VS. ${match.awayTeam.toUpperCase()}`;
            const dedupeKey = `${cleanDate}-${eventTitle}`;

            if (seenEvents.has(dedupeKey)) continue;
            seenEvents.add(dedupeKey);

            venueData.push({
                venue: 'America First Field',
                title: eventTitle,
                date: cleanDate,
                time: cleanTime,
                type: cleanType
            });
            console.log(`✅ Kept: ${eventTitle} on ${cleanDate} (${cleanTime}) [${cleanType}]`);
        }
    } catch (e) { console.log(`❌ RSL failed: ${e.message}`); }
    await page.close();
    return venueData;
}

// 5. America First Field 
async function scrapeRSLW(browser) {
    const page = await browser.newPage();
    let royalsData = [];
    const today = new Date().toISOString().split('T')[0];

    try {
        console.log(`\nNavigating to Utah Royals Schedule...`);
        await page.goto('https://www.rsl.com/utahroyals/schedule/#competition=all&date=2026-01-01', { waitUntil: 'domcontentloaded', timeout: 30000 });

        await page.waitForSelector('.mls-c-match-list__match, tr', { timeout: 15000 });
        await page.waitForTimeout(2000);

        const rawRows = await page.$$eval('.mls-c-match-list__match, tr', (rows) => {
            return rows.map(row => {
                const matchLink = row.querySelector('a[href*="/matches/"]');
                const href = matchLink ? matchLink.href : "";

                let urlDate = "";
                const urlDateMatch = href.match(/(\d{2})-(\d{2})-(\d{4})/);
                if (urlDateMatch) {
                    urlDate = `${urlDateMatch[3]}-${urlDateMatch[1]}-${urlDateMatch[2]}`;
                }

                const home = row.querySelector('.--home .mls-c-club__shortname, td[data-label="Home Team"]')?.innerText || "Utah Royals";
                const away = row.querySelector('.--away .mls-c-club__shortname, td[data-label="Away Team"]')?.innerText || "Opponent TBD";
                const time = row.querySelector('.mls-c-scorebug span, td[data-label="Time"]')?.innerText || "TBA";
                const place = row.querySelector('.mls-c-match-list__match-info p:last-child, td[data-label="Place"]')?.innerText || "";

                return { urlDate, home, away, time, place };
            });
        });

        royalsData = rawRows
            .filter(item => item.place.toLowerCase().includes('america first field') || item.home.toLowerCase().includes('royals'))
            .map(item => {
                const fullTitle = `${item.home.trim()} vs. ${item.away.trim()}`;
                return {
                    venue: 'America First Field',
                    title: fullTitle,
                    date: item.urlDate || formatDate(item.date),
                    time: formatTime(item.time),
                    type: 'NWSL'
                };
            });

        console.log(`Pulling ${royalsData.length} Utah Royals home games.`);
    } catch (e) { console.log(`Utah Royals failed: ${e.message}`); }
    await page.close();
    return royalsData;
}

// 6. Auburn Gymnastics (Neville Arena)
async function scrapeNAGym(browser) {
    const page = await browser.newPage();
    let finalResults = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        console.log(`\nNavigating to Neville Arena Gymnastics Schedule...`);
        await page.goto('https://auburntigers.com/sports/gymnastics/schedule', { waitUntil: 'domcontentloaded', timeout: 30000 });

        try {
            const cookieBtn = page.locator('button.iubenda-cs-accept-btn, #onetrust-accept-btn-handler');
            if (await cookieBtn.isVisible({ timeout: 4000 })) await cookieBtn.click();
        } catch (e) {}

        await page.waitForSelector('table tbody tr, .c-schedule__item', { timeout: 15000 }).catch(() => {});

        const rawRows = await page.evaluate(() => {
            const results = [];
            const tableRows = document.querySelectorAll('table tbody tr');

            tableRows.forEach(tr => {
                const cells = tr.querySelectorAll('td, th');
                if (cells.length >= 3) {
                    results.push({
                        dateText: cells[0]?.innerText.trim() || "",
                        teamText: cells[1]?.innerText.trim() || "",
                        locationText: cells[2]?.innerText.trim() || "",
                        timeText: cells[3]?.innerText.trim() || ""
                    });
                }
            });
            return results;
        });

        for (const item of rawRows) {
            const locUpper = item.locationText.toUpperCase();
            if (!locUpper.includes('NEVILLE ARENA') && !(locUpper.includes('AUBURN, AL') && !locUpper.includes('CENTER'))) {
                continue;
            }

            const opponent = cleanOpponent(item.teamText);
            const cleanDate = formatDate(`${item.dateText} 2026`);
            let cleanTime = "TBA";
            const timeMatch = item.timeText.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i);
            if (timeMatch) cleanTime = formatTime(timeMatch[1]);

            if (cleanDate !== "TBA" && new Date(cleanDate) < today) continue;

            finalResults.push({
                venue: 'Neville Arena',
                title: `AUBURN VS. ${opponent.toUpperCase()}`,
                date: cleanDate,
                time: cleanTime,
                type: 'Gymnastics'
            });
        }
        console.log(`Pulling ${finalResults.length} Gymnastics meets at Neville Arena.`);
    } catch (e) { console.log(`Neville Arena - Gymnastics failed: ${e.message}`); }
    await page.close();
    return finalResults;
}

// 7. Auburn Men's Basketball (Neville Arena)
async function scrapeNAMB(browser) {
    const page = await browser.newPage();
    let finalResults = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        console.log(`\nNavigating to Neville Arena MBB Schedule...`);
        await page.goto('https://auburntigers.com/sports/mens-basketball/schedule', { waitUntil: 'domcontentloaded', timeout: 30000 });

        try {
            const cookieBtn = page.locator('button.iubenda-cs-accept-btn, #onetrust-accept-btn-handler');
            if (await cookieBtn.isVisible({ timeout: 4000 })) await cookieBtn.click();
        } catch (e) {}

        await page.waitForSelector('table tbody tr, .c-schedule__item, .schedule-event-item', { timeout: 15000 }).catch(() => {});

        const rawRows = await page.evaluate(() => {
            const results = [];
            const tableRows = document.querySelectorAll('table tbody tr');

            tableRows.forEach(tr => {
                const cells = tr.querySelectorAll('td, th');
                if (cells.length >= 3) {
                    results.push({
                        dateText: cells[0]?.innerText.trim() || "",
                        teamText: cells[1]?.innerText.trim() || "",
                        locationText: cells[2]?.innerText.trim() || "",
                        timeText: cells[3]?.innerText.trim() || ""
                    });
                }
            });
            return results;
        });

        for (const item of rawRows) {
            const locUpper = item.locationText.toUpperCase();
            if (!locUpper.includes('NEVILLE ARENA') && !(locUpper.includes('AUBURN, AL') && !locUpper.includes('CENTER'))) {
                continue;
            }

            const opponent = cleanOpponent(item.teamText);
            const monthStr = item.dateText.toLowerCase().substring(0, 3);
            const year = getYearForMonth(monthStr);
            const cleanDate = formatDate(`${item.dateText} ${year}`);
            let cleanTime = "TBA";
            const timeMatch = item.timeText.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i);
            if (timeMatch) cleanTime = formatTime(timeMatch[1]);

            if (cleanDate !== "TBA" && new Date(cleanDate) < today) continue;

            finalResults.push({
                venue: 'Neville Arena',
                title: `AUBURN VS. ${opponent.toUpperCase()}`,
                date: cleanDate,
                time: cleanTime,
                type: 'NCAA MB'
            });
        }
        console.log(`Pulling ${finalResults.length} MBB games at Neville Arena.`);
    } catch (e) { console.log(`Neville Arena - Men's Basketball failed: ${e.message}`); }
    await page.close();
    return finalResults;
}

// 8. Auburn Women's Basketball (Neville Arena)
async function scrapeNAWB(browser) {
    const page = await browser.newPage();
    let finalResults = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        console.log(`\nNavigating to Neville Arena WBB Schedule...`);
        await page.goto('https://auburntigers.com/sports/womens-basketball/schedule', { waitUntil: 'domcontentloaded', timeout: 30000 });

        try {
            const cookieBtn = page.locator('button.iubenda-cs-accept-btn, #onetrust-accept-btn-handler');
            if (await cookieBtn.isVisible({ timeout: 4000 })) await cookieBtn.click();
        } catch (e) {}

        await page.waitForSelector('table tbody tr, .c-schedule__item, .schedule-event-item', { timeout: 15000 }).catch(() => {});

        const rawRows = await page.evaluate(() => {
            const results = [];
            const tableRows = document.querySelectorAll('table tbody tr');

            tableRows.forEach(tr => {
                const cells = tr.querySelectorAll('td, th');
                if (cells.length >= 3) {
                    results.push({
                        dateText: cells[0]?.innerText.trim() || "",
                        teamText: cells[1]?.innerText.trim() || "",
                        locationText: cells[2]?.innerText.trim() || "",
                        timeText: cells[3]?.innerText.trim() || ""
                    });
                }
            });
            return results;
        });

        for (const item of rawRows) {
            const locUpper = item.locationText.toUpperCase();
            if (!locUpper.includes('NEVILLE ARENA') && !(locUpper.includes('AUBURN, AL') && !locUpper.includes('CENTER'))) {
                continue;
            }

            const opponent = cleanOpponent(item.teamText);
            const monthStr = item.dateText.toLowerCase().substring(0, 3);
            const year = getYearForMonth(monthStr);
            const cleanDate = formatDate(`${item.dateText} ${year}`);
            let cleanTime = "TBA";
            const timeMatch = item.timeText.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i);
            if (timeMatch) cleanTime = formatTime(timeMatch[1]);

            if (cleanDate !== "TBA" && new Date(cleanDate) < today) continue;

            finalResults.push({
                venue: 'Neville Arena',
                title: `AUBURN VS. ${opponent.toUpperCase()}`,
                date: cleanDate,
                time: cleanTime,
                type: 'NCAA WB'
            });
        }
        console.log(`Pulling ${finalResults.length} WBB games at Neville Arena.`);
    } catch (e) { console.log(`Neville Arena - Women's Basketball failed: ${e.message}`); }
    await page.close();
    return finalResults;
}

// 9. Auburn Women's Volleyball (Neville Arena)
async function scrapeNAWVB(browser) {
    const page = await browser.newPage();
    let finalResults = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        console.log(`\nNavigating to Neville Arena Volleyball Schedule...`);
        await page.goto('https://auburntigers.com/sports/womens-volleyball/schedule', { waitUntil: 'domcontentloaded', timeout: 30000 });

        try {
            const cookieBtn = page.locator('button.iubenda-cs-accept-btn, #onetrust-accept-btn-handler');
            if (await cookieBtn.isVisible({ timeout: 4000 })) await cookieBtn.click();
        } catch (e) {}

        await page.waitForSelector('table tbody tr, .c-schedule__item, .schedule-event-item', { timeout: 15000 }).catch(() => {});

        const rawRows = await page.evaluate(() => {
            const results = [];
            const tableRows = document.querySelectorAll('table tbody tr');

            tableRows.forEach(tr => {
                const cells = tr.querySelectorAll('td, th');
                if (cells.length >= 3) {
                    results.push({
                        dateText: cells[0]?.innerText.trim() || "",
                        teamText: cells[1]?.innerText.trim() || "",
                        locationText: cells[2]?.innerText.trim() || "",
                        timeText: cells[3]?.innerText.trim() || ""
                    });
                }
            });
            return results;
        });

        for (const item of rawRows) {
            const locUpper = item.locationText.toUpperCase();
            if (!locUpper.includes('NEVILLE ARENA') && !(locUpper.includes('AUBURN, AL') && !locUpper.includes('CENTER'))) {
                continue;
            }

            const opponent = cleanOpponent(item.teamText);
            const cleanDate = formatDate(`${item.dateText} 2026`);
            let cleanTime = "TBA";
            const timeMatch = item.timeText.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i);
            if (timeMatch) cleanTime = formatTime(timeMatch[1]);

            if (cleanDate !== "TBA" && new Date(cleanDate) < today) continue;

            finalResults.push({
                venue: 'Neville Arena',
                title: `AUBURN VS. ${opponent.toUpperCase()}`,
                date: cleanDate,
                time: cleanTime,
                type: 'NCAA WVB'
            });
        }
        console.log(`Pulling ${finalResults.length} Volleyball matches at Neville Arena.`);
    } catch (e) { console.log(`Neville Arena - Women's Volleyball failed: ${e.message}`); }
    await page.close();
    return finalResults;
}

// 10. Baylor Bears (Foster Pavilion)
async function scrapeBaylor(browser) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await setupTranscendKiller(page);

    let BaylorResult = [];

    try {
        console.log(`\nNavigating to Baylor Bears Calendar...`);
        await page.goto('https://baylorbears.com/calendar', { waitUntil: 'domcontentloaded', timeout: 35000 });
        await page.waitForTimeout(3000);

        for (let m = 0; m < 13; m++) {
            const titleLoc = page.locator('.fc-toolbar-title');
            if (await titleLoc.count() === 0) break;
            const monthTitle = await titleLoc.innerText();
            console.log(`Pulling Baylor: ${monthTitle}`);

            const eventHarnesses = page.locator('.fc-daygrid-event-harness');
            const count = await eventHarnesses.count();

            for (let i = 0; i < count; i++) {
                const harness = eventHarnesses.nth(i);
                const text = await harness.innerText();

                if (text.includes('WBB') || text.includes('MBB') || text.includes('CONCERT')) {
                    try {
                        await harness.click({ force: true });
                        await page.waitForSelector('.c-calendar-modal__wrapper', { state: 'visible', timeout: 4000 });
                        await page.waitForTimeout(500);

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
                            }
                        }

                        await page.locator('button:has-text("Close")').first().click();
                        await page.waitForTimeout(400);
                    } catch (err) {
                        await page.keyboard.press('Escape');
                    }
                }
            }
            await page.getByTitle('Next month').click();
            await page.waitForTimeout(1500);
        }
    } catch (e) { console.log(`Baylor failed: ${e.message}`); }
    await page.close();
    await context.close();
    return BaylorResult;
}

// =======================================================================================
// MAIN EXECUTION

(async () => {
    const browser = await chromium.launch({ headless: false });

    const results = await Promise.all([
        scrapeJPJ(browser),
        scrapeVT(browser),
        scrapeBJC(browser),
        scrapeRSL(browser),
        scrapeRSLW(browser),
        scrapeNAGym(browser),
        scrapeNAMB(browser),
        scrapeNAWB(browser),
        scrapeNAWVB(browser),
        scrapeBaylor(browser)
    ]);

    const allData = results.flat();
    console.log(`\n🏁 Total events scraped: ${allData.length}`);

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

    if (allData.length > 0) {
        await csvWriter.writeRecords(allData);
        console.log('✅ Done! All events saved to calendar-2.csv');
    } else {
        console.log('⚠️ No data to write to CSV.');
    }

    await browser.close();
})();