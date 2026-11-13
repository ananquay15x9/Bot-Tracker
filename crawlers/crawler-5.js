const { chromium } = require('playwright');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// =========================================================================
const AOTW_LIST_URL = 'https://www.angelofthewindsarena.com/events/venue/angel-of-the-winds-arena';
const AOTW_MONTHS = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

// "7:05 PM" -> "7:05PM", "7 PM" -> "7:00PM"
function formatTimeAOTW(timeStr) {
    const m = (timeStr || '').match(/(\d{1,2})(?::(\d{2}))?\s*([AP])\.?M/i);
    if (!m) return 'TBA';
    return `${parseInt(m[1], 10)}:${m[2] || '00'}${m[3].toUpperCase()}M`;
}

function isoDateAOTW(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Parses the sidebar date into a list of days.
//   "Friday, November 6, 2026"            -> [2026-11-06]
function parseDateRangeAOTW(text) {
    const t = (text || '').replace(/\s+/g, ' ').trim();
    const re = /([A-Za-z]{3,})\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?(?:\s*[-–]\s*(?:([A-Za-z]{3,})\.?\s+)?(\d{1,2})(?:,?\s*(\d{4}))?)?/;
    const m = t.match(re);
    if (!m) return [];

    const startMonth = AOTW_MONTHS[m[1].toLowerCase().slice(0, 3)];
    if (!startMonth) return [];
    const startDay = parseInt(m[2], 10);
    const endYearRaw = m[6] ? parseInt(m[6], 10) : null;
    const startYearRaw = m[3] ? parseInt(m[3], 10) : null;
    const fallbackYear = new Date().getFullYear();

    // No end part: single day
    if (!m[5]) {
        return [isoDateAOTW(startYearRaw || fallbackYear, startMonth, startDay)];
    }

    const endMonth = m[4] ? AOTW_MONTHS[m[4].toLowerCase().slice(0, 3)] : startMonth;
    const endDay = parseInt(m[5], 10);
    const endYear = endYearRaw || startYearRaw || fallbackYear;
    const startYear = startYearRaw || (endMonth < startMonth ? endYear - 1 : endYear);

    const days = [];
    const cur = new Date(startYear, startMonth - 1, startDay);
    const end = new Date(endYear, endMonth - 1, endDay);
    for (let i = 0; cur <= end && i < 60; i++) {
        days.push(isoDateAOTW(cur.getFullYear(), cur.getMonth() + 1, cur.getDate()));
        cur.setDate(cur.getDate() + 1);
    }
    return days;
}

function categorizeAOTW(title) {
    const t = (title || '').toLowerCase();

    // Everett Silvertips = hockey -> Other
    if (t.includes('everett silvertips') || t.includes('silvertips')) return 'Other';

    // WSU basketball (women's first so it isn't caught by the men's rule)
    if (/\b(wsu|washington state)\b/.test(t)) {
        if (/\bwomen'?s?\b|\bwbb\b|\blady\b/.test(t)) return 'NCAA WB';
        return 'NCAA MB';
    }
    if (/women'?s basketball/.test(t)) return 'NCAA WB';
    if (/men'?s basketball/.test(t)) return 'NCAA MB';

    // Concerts (whole words only, so "Monster Jam" or "Holiday on Ice" aren't counted)
    const concertWords = [
        'music', 'wonderland', 'concert', 'tour', 'live', 'band', 'symphony', 'orchestra',
        'tribute', 'festival', 'singer', 'rock', 'country', 'hip hop', 'rap', 'r&b', 'jazz',
        'choir', 'unplugged', 'acoustic'
    ];
    if (concertWords.some(w => new RegExp(`\\b${w.replace(/[&]/g, '\\$&')}\\b`).test(t))) return 'Concert';

    return 'Other';
}

// Runs inside the detail page and returns the raw pieces we need
function extractAOTWDetail() {
    const clean = s => (s || '').replace(/\s+/g, ' ').trim();

    const title = clean(document.querySelector('h1.title')?.textContent)
        || clean(document.querySelector('h1')?.textContent)
        || clean(document.querySelector('meta[property="og:title"]')?.getAttribute('content'));

    const dateLi = document.querySelector('.eventDetailList .sidebar_event_date');
    let dateText = '';
    if (dateLi) {
        const clone = dateLi.cloneNode(true);
        clone.querySelectorAll('.label, svg').forEach(el => el.remove());
        dateText = clean(clone.textContent);
    }

    const startsLi = document.querySelector('.eventDetailList .sidebar_event_starts');
    let startsText = '';
    if (startsLi) {
        const clone = startsLi.cloneNode(true);
        clone.querySelectorAll('.label, svg').forEach(el => el.remove());
        startsText = clean(clone.textContent);
    }

    // Multi-date events list each showing in the body
    const showings = Array.from(document.querySelectorAll('ul.list li.listItem')).map(li => ({
        dateText: clean(li.querySelector('.showings_date')?.textContent),
        timeText: clean(li.querySelector('.time')?.textContent),
        // e.g. "Buy Tickets for November 14 2026 at 2:00 PM" (has the year)
        ticketTitle: clean(li.querySelector('a.tickets')?.getAttribute('title'))
    }));

    return { title, dateText, startsText, showings };
}

// Opens a detail page and waits for its title; retries once with a longer wait
// (pages load slowly when several venue browsers run at the same time)
// Opens a detail page. Waits for the event title, but never for long:
//  - normal pages have h1.title; some (e.g. a redirected or special event page) don't,
//    so any <h1> or the sidebar date list also counts as "loaded"
//  - one retry for a slow page, then give up on that event and move on
// Returns false if the page/browser has been closed, so the caller can stop.
async function gotoDetailWithRetry(page, url) {
    for (let attempt = 1; attempt <= 2; attempt++) {
        if (page.isClosed()) return false;
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: attempt === 1 ? 25000 : 40000 });
            await page.waitForSelector('h1.title, h1, .eventDetailList', { state: 'attached', timeout: attempt === 1 ? 10000 : 15000 });
            return true;
        } catch (err) {
            if (page.isClosed() || /has been closed/i.test(err.message)) return false;
            if (attempt === 2) throw err;
            console.log(`   ↻ Slow page, retrying: ${url}`);
            await page.waitForTimeout(1500).catch(() => {});
        }
    }
    return true;
}

async function scrapeAngelOfTheWinds(browser) {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 900 }
    });
    const page = await context.newPage();
    const venueData = [];
    const seen = new Set();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isPast = (iso) => {
        const [y, m, d] = iso.split('-').map(Number);
        return new Date(y, m - 1, d) < today;
    };

    const addRow = (title, date, time, type) => {
        if (date !== 'TBA' && isPast(date)) return;
        const key = `${date}|${time}|${title}`;
        if (seen.has(key)) return;
        seen.add(key);
        venueData.push({ venue: 'Angel of the Winds', title, date, time, type });
        console.log(`✅ Kept: ${title} on ${date} (${time}) [${type}]`);
    };

    try {
        console.log('\n🚀 Scraping Angel of the Winds Arena...');
        await page.goto(AOTW_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });

        try {
            const cookieBtn = page.locator('#onetrust-accept-btn-handler, button:has-text("Accept")').first();
            if (await cookieBtn.isVisible({ timeout: 3000 })) await cookieBtn.click();
        } catch (e) {}

        const linkSelector = 'a[href*="/events/detail/"]';
        await page.waitForSelector(linkSelector, { timeout: 20000 });

        // ---- Click "More Events" until the button is gone (that's the end of the list).
        // The button hides/disables itself while loading and can be covered by popups, so:
        //  - click it with a DOM click (works even if something overlaps it)
        //  - wait up to 15s for new events
        //  - only stop once the button has been gone for a few seconds, or 3 clicks in a row add nothing
        const countEvents = () => page.locator(linkSelector).count();
        const buttonPresent = () => page.evaluate(() => {
            const btn = document.querySelector('#loadMoreEvents');
            if (!btn) return false;
            const style = window.getComputedStyle(btn);
            return style.display !== 'none' && style.visibility !== 'hidden' && btn.offsetParent !== null;
        });

        let failedClicks = 0;
        for (let i = 0; i < 150; i++) {
            // Give the button a moment to come back after the previous load
            let present = await buttonPresent();
            for (let w = 0; !present && w < 6; w++) {
                await page.waitForTimeout(500);
                present = await buttonPresent();
            }
            if (!present) {
                console.log('   ↪︎ "More Events" button is gone, reached the end of the list.');
                break;
            }

            const before = await countEvents();
            const offset = await page.locator('#loadMoreEvents').getAttribute('data-offset').catch(() => '?');

            await page.locator('#loadMoreEvents').scrollIntoViewIfNeeded().catch(() => {});
            await page.evaluate(() => document.querySelector('#loadMoreEvents')?.click());

            try {
                await page.waitForFunction(
                    ([sel, n]) => document.querySelectorAll(sel).length > n,
                    [linkSelector, before],
                    { timeout: 15000 }
                );
                failedClicks = 0;
                console.log(`   ↪︎ More Events (offset ${offset}): ${before} -> ${await countEvents()} links`);
            } catch {
                failedClicks++;
                console.log(`   ↪︎ More Events click added nothing (attempt ${failedClicks}/3)`);
                if (failedClicks >= 3) break;
            }
            await page.waitForTimeout(800);
        }

        // ---- Collect unique detail links
        const detailUrls = await page.evaluate(sel => {
            const urls = Array.from(document.querySelectorAll(sel)).map(a => a.href.split('#')[0]);
            return Array.from(new Set(urls));
        }, linkSelector);
        console.log(`📋 Found ${detailUrls.length} Angel of the Winds events.`);

        // ---- Open each detail page
        let checked = 0;
        for (const url of detailUrls) {
            checked++;
            if (checked % 10 === 0 || checked === detailUrls.length) {
                console.log(`   ↪︎ Detail pages checked: ${checked}/${detailUrls.length}`);
            }
            try {
                if (!(await gotoDetailWithRetry(page, url))) {
                    console.log('   ⚠️ Browser page was closed, stopping this venue.');
                    break;
                }

                const d = await page.evaluate(extractAOTWDetail);
                if (!d.title) continue;

                const title = d.title;
                const type = categorizeAOTW(title);
                const sidebarDays = parseDateRangeAOTW(d.dateText);
                const sidebarYear = sidebarDays.length ? parseInt(sidebarDays[0].slice(0, 4), 10) : today.getFullYear();
                const sidebarStartMonth = sidebarDays.length ? parseInt(sidebarDays[0].slice(5, 7), 10) : 1;

                if (d.showings.length > 0) {
                    // Multi-date event: one row per showing (date + time)
                    for (const s of d.showings) {
                        let date = 'TBA';
                        const fromTicket = s.ticketTitle.match(/([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})/);
                        if (fromTicket && AOTW_MONTHS[fromTicket[1].toLowerCase().slice(0, 3)]) {
                            date = isoDateAOTW(fromTicket[3], AOTW_MONTHS[fromTicket[1].toLowerCase().slice(0, 3)], fromTicket[2]);
                        } else {
                            const md = s.dateText.match(/([A-Za-z]{3,})\s+(\d{1,2})/g);
                            const last = md ? md[md.length - 1].match(/([A-Za-z]{3,})\s+(\d{1,2})/) : null;
                            const month = last ? AOTW_MONTHS[last[1].toLowerCase().slice(0, 3)] : null;
                            if (month) {
                                // A showing in an earlier month than the event start rolls into next year
                                const year = month < sidebarStartMonth ? sidebarYear + 1 : sidebarYear;
                                date = isoDateAOTW(year, month, last[2]);
                            }
                        }
                        const time = formatTimeAOTW(s.timeText || s.ticketTitle);
                        addRow(title, date, time, type);
                    }
                } else if (sidebarDays.length > 0) {
                    // Single date (or a range with no showings list): use "Event Starts" time
                    const time = formatTimeAOTW(d.startsText);
                    for (const day of sidebarDays) addRow(title, day, time, type);
                } else {
                    console.log(`   ⚠️ No date found for "${title}" (${url})`);
                }
            } catch (err) {
                console.log(`   ⚠️ Skipped ${url}: ${err.message}`);
            }
        }

        console.log(`🏁 Angel of the Winds: all ${detailUrls.length} events checked, ${venueData.length} rows. Closing.`);
    } catch (err) {
        console.error('❌ Angel of the Winds failed:', err.message);
    } finally {
        await page.close();
        await context.close();
    }

    return venueData;
}

// =========================================================================
// FIRST HORIZON COLISEUM (Greensboro Coliseum Complex)
// List page -> scroll to the bottom (and click "More Events" if it shows) ->
// open each event's detail page -> keep only Venue = "First Horizon Coliseum".
// Times on the site are already local (ET), so no time zone conversion.
// =========================================================================

const FHC_LIST_URL = 'https://www.gsocomplex.com/events/all';

function categorizeFHC(title) {
    const t = (title || '').toLowerCase();

    // Greensboro Gargoyles = ECHL hockey
    if (t.includes('greensboro gargoyles') || t.includes('gargoyles')) return 'ECHL';

    // Basketball: women's first, because "women's" also contains "men's"
    if (/women'?s basketball|\bwbb\b/.test(t)) return 'NCAA WB';
    if (/\bmen'?s basketball|\bmbb\b/.test(t)) return 'NCAA MB';
    if (/\bbasketball\b/.test(t) && /\b(college|university|state|vs\.?)\b/.test(t)) return 'NCAA MB';

    // Concerts (whole words)
    const concertWords = [
        'festival', 'music', 'r&b', 'disney', 'concert', 'tour', 'live', 'band', 'symphony',
        'orchestra', 'jazz', 'gospel', 'hip hop', 'rap', 'country', 'rock', 'singer', 'tribute'
    ];
    if (concertWords.some(w => new RegExp(`(^|[^a-z])${w.replace(/[&]/g, '\\$&')}([^a-z]|$)`).test(t))) return 'Concert';

    return 'Other';
}

// Runs inside the detail page
function extractFHCDetail() {
    const clean = s => (s || '').replace(/\s+/g, ' ').trim();
    const sidebarText = (sel) => {
        const li = document.querySelector(`.eventDetailList ${sel}`);
        if (!li) return '';
        const clone = li.cloneNode(true);
        clone.querySelectorAll('.label, svg').forEach(el => el.remove());
        return clean(clone.textContent);
    };

    const title = clean(document.querySelector('h1.title')?.textContent)
        || clean(document.querySelector('h1')?.textContent)
        || clean(document.querySelector('meta[property="og:title"]')?.getAttribute('content'));
    const dateText = sidebarText('.sidebar_event_date');
    const startsText = sidebarText('.sidebar_event_starts');
    const venueText = sidebarText('.sidebar_event_venue');

    // Keep line breaks in the description so "Women's Game - 5:30 p.m." stays on its own line
    const descEl = document.querySelector('.event_description .description_inner, .event_description');
    let description = '';
    if (descEl) {
        const tmp = document.createElement('div');
        tmp.innerHTML = descEl.innerHTML.replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, '\n');
        description = tmp.textContent || '';
    }

    const showings = Array.from(document.querySelectorAll('ul.list li.listItem')).map(li => ({
        dateText: clean(li.querySelector('.showings_date')?.textContent),
        timeText: clean(li.querySelector('.time')?.textContent),
        ticketTitle: clean(li.querySelector('a.tickets')?.getAttribute('title'))
    }));

    return { title, dateText, startsText, venueText, description, showings };
}

// "Women's Game - 5:30 p.m." / "Men's Game - 7:30 p.m." -> [{type:'NCAA WB', time:'5:30PM'}, {type:'NCAA MB', time:'7:30PM'}]
function parseGenderedGameTimesFHC(description) {
    const games = [];
    for (const line of (description || '').split(/\n|<br\s*\/?>/i)) {
        const timeMatch = line.match(/\d{1,2}(?::\d{2})?\s*[ap]\.?\s*m\.?/i);
        if (!timeMatch) continue;
        if (/women/i.test(line)) games.push({ type: 'NCAA WB', time: formatTimeAOTW(timeMatch[0].replace(/\s+/g, '')) });
        else if (/\bmen'?s?\b/i.test(line)) games.push({ type: 'NCAA MB', time: formatTimeAOTW(timeMatch[0].replace(/\s+/g, '')) });
    }
    return games;
}

async function scrapeFirstHorizon(browser) {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 900 }
    });
    const page = await context.newPage();
    const venueData = [];
    const seen = new Set();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isPast = (iso) => {
        const [y, m, d] = iso.split('-').map(Number);
        return new Date(y, m - 1, d) < today;
    };
    const addRow = (title, date, time, type) => {
        if (date !== 'TBA' && isPast(date)) return;
        const key = `${date}|${time}|${title}|${type}`;
        if (seen.has(key)) return;
        seen.add(key);
        venueData.push({ venue: 'First Horizon Coliseum', title, date, time, type });
        console.log(`✅ Kept: ${title} on ${date} (${time}) [${type}]`);
    };

    try {
        console.log('\n🚀 Scraping First Horizon Coliseum (gsocomplex.com)...');
        await page.goto(FHC_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });

        try {
            const cookieBtn = page.locator('#onetrust-accept-btn-handler, button:has-text("Accept")').first();
            if (await cookieBtn.isVisible({ timeout: 3000 })) await cookieBtn.click();
        } catch (e) {}

        const linkSelector = 'a[href*="/events/detail/"]';
        await page.waitForSelector(linkSelector, { timeout: 20000 });

        // ---- Scroll all the way down until no new events appear.
        // If a "More Events" button shows up, click it too.
        let stableRounds = 0;
        let lastCount = await page.locator(linkSelector).count();
        for (let i = 0; i < 200 && stableRounds < 4; i++) {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(1200);

            const clicked = await page.evaluate(() => {
                const btn = document.querySelector('#loadMoreEvents');
                if (btn && btn.offsetParent !== null) { btn.click(); return true; }
                return false;
            });
            if (clicked) await page.waitForTimeout(1500);

            const count = await page.locator(linkSelector).count();
            if (count > lastCount) {
                console.log(`   ↪︎ Loaded more events: ${lastCount} -> ${count} links`);
                lastCount = count;
                stableRounds = 0;
            } else {
                stableRounds++;
            }
        }
        console.log('   ↪︎ Reached the bottom of the event list.');

        const detailUrls = await page.evaluate(sel => {
            const urls = Array.from(document.querySelectorAll(sel)).map(a => a.href.split('#')[0]);
            return Array.from(new Set(urls));
        }, linkSelector);
        console.log(`📋 Found ${detailUrls.length} events across the complex.`);

        let otherVenue = 0;

        let checked = 0;
        for (const url of detailUrls) {
            checked++;
            if (checked % 10 === 0 || checked === detailUrls.length) {
                console.log(`   ↪︎ Detail pages checked: ${checked}/${detailUrls.length}`);
            }
            try {
                if (!(await gotoDetailWithRetry(page, url))) {
                    console.log('   ⚠️ Browser page was closed, stopping this venue.');
                    break;
                }

                const d = await page.evaluate(extractFHCDetail);
                if (!d.title) continue;

                // Only events at First Horizon Coliseum
                if (!/first horizon coliseum/i.test(d.venueText)) {
                    otherVenue++;
                    continue;
                }

                const title = d.title;
                const baseType = categorizeFHC(title);

                // ---- Build the list of (date, time) slots
                const sidebarDays = parseDateRangeAOTW(d.dateText);
                const sidebarYear = sidebarDays.length ? parseInt(sidebarDays[0].slice(0, 4), 10) : today.getFullYear();
                const sidebarStartMonth = sidebarDays.length ? parseInt(sidebarDays[0].slice(5, 7), 10) : 1;
                const slots = [];

                if (d.showings.length > 0) {
                    for (const s of d.showings) {
                        let date = 'TBA';
                        const fromTicket = s.ticketTitle.match(/([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})/);
                        if (fromTicket && AOTW_MONTHS[fromTicket[1].toLowerCase().slice(0, 3)]) {
                            date = isoDateAOTW(fromTicket[3], AOTW_MONTHS[fromTicket[1].toLowerCase().slice(0, 3)], fromTicket[2]);
                        } else {
                            const md = s.dateText.match(/([A-Za-z]{3,})\s+(\d{1,2})/g);
                            const last = md ? md[md.length - 1].match(/([A-Za-z]{3,})\s+(\d{1,2})/) : null;
                            const month = last ? AOTW_MONTHS[last[1].toLowerCase().slice(0, 3)] : null;
                            if (month) {
                                const year = month < sidebarStartMonth ? sidebarYear + 1 : sidebarYear;
                                date = isoDateAOTW(year, month, last[2]);
                            }
                        }
                        slots.push({ date, time: formatTimeAOTW(s.timeText || s.ticketTitle) });
                    }
                } else if (sidebarDays.length > 0) {
                    const time = formatTimeAOTW(d.startsText);
                    for (const day of sidebarDays) slots.push({ date: day, time });
                } else {
                    console.log(`   ⚠️ No date found for "${title}" (${url})`);
                    continue;
                }

                // ---- Doubleheaders: "Women's Game - 5:30 p.m." / "Men's Game - 7:30 p.m."
                const genderedGames = /basketball/i.test(title) || baseType.startsWith('NCAA')
                    ? parseGenderedGameTimesFHC(d.description)
                    : [];

                for (const slot of slots) {
                    if (genderedGames.length > 0) {
                        for (const g of genderedGames) addRow(title, slot.date, g.time, g.type);
                    } else {
                        addRow(title, slot.date, slot.time, baseType);
                    }
                }
            } catch (err) {
                console.log(`   ⚠️ Skipped ${url}: ${err.message}`);
            }
        }

        console.log(`🏁 First Horizon Coliseum: ${venueData.length} rows (${otherVenue} events at other complex venues skipped).`);
    } catch (err) {
        console.error('❌ First Horizon Coliseum failed:', err.message);
    } finally {
        await page.close();
        await context.close();
    }

    return venueData;
}

// =========================================================================
// EAGLEBANK ARENA (Fairfax, VA)
// List page -> click "More Events" until the button is gone -> read each card.
// Single-date cards are read straight from the grid; date ranges
// (e.g. "Apr 29 - May 2, 2027") open the detail page and read every showing.
// Times on the site are already local (ET), so no time zone conversion.
// =========================================================================

const EBA_LIST_URL = 'https://www.eaglebankarena.com/events';

function categorizeEBA(title) {
    const t = (title || '').toLowerCase();

    // George Mason: women's team first, since "George Mason" alone means the men's team
    if (/george mason women|george mason wbb/.test(t) || /women'?s basketball/.test(t)) return 'NCAA WB';
    if (t.includes('george mason') || /\bmen'?s basketball/.test(t)) return 'NCAA MB';

    // Concerts (whole words)
    const concertWords = [
        'concert', 'tour', 'music', 'festival', 'live', 'band', 'symphony', 'orchestra', 'r&b',
        'jazz', 'gospel', 'hip hop', 'rap', 'country', 'rock', 'singer', 'tribute', 'disney'
    ];
    if (concertWords.some(w => new RegExp(`(^|[^a-z])${w.replace(/[&]/g, '\\$&')}([^a-z]|$)`).test(t))) return 'Concert';

    return 'Other';
}

// Runs in the list page: one entry per event card
function extractEBACards() {
    const clean = s => (s || '').replace(/\s+/g, ' ').trim();
    const cards = [];
    document.querySelectorAll('h3.title a[href*="/events/detail/"]').forEach(a => {
        // Climb to the card that holds this title and its date box (and no other titles)
        let card = a.closest('h3.title');
        while (card && card.parentElement &&
               !(card.querySelector('.date') && card.querySelectorAll('h3.title').length === 1)) {
            if (card.parentElement.querySelectorAll('h3.title').length > 1) break;
            card = card.parentElement;
        }
        const dateBox = card ? card.querySelector('.date') : null;

        let dateText = '';
        if (dateBox) {
            const clone = dateBox.cloneNode(true);
            clone.querySelectorAll('.time').forEach(el => el.remove());
            dateText = clean(clone.textContent);
        }

        cards.push({
            url: a.href.split('#')[0],
            title: clean(a.textContent),
            dateText,
            isRange: !!(dateBox && dateBox.querySelector('.m-date__rangeFirst, .m-date__separator')),
            startText: clean(card?.querySelector('.meta .start')?.textContent) || clean(dateBox?.querySelector('.time')?.textContent)
        });
    });
    return cards;
}

// Runs in the detail page: every showing (visible or under "More Showings")
function extractEBAShowings() {
    const clean = s => (s || '').replace(/\s+/g, ' ').trim();
    const title = clean(document.querySelector('h1.title')?.textContent)
        || clean(document.querySelector('h1')?.textContent)
        || clean(document.querySelector('meta[property="og:title"]')?.getAttribute('content'));
    const items = document.querySelectorAll('.event_showings .listItem, ul.list li.listItem');
    const showings = Array.from(items).map(li => ({
        dateText: clean(li.querySelector('.showings_date')?.textContent),
        timeText: clean(li.querySelector('.time')?.textContent),
        // "Add to Calendar for May  1 2027 at 10:30 AM" / "Buy Tickets for ..." (both carry the year)
        icalTitle: clean(li.querySelector('a.ical')?.getAttribute('title')),
        ticketTitle: clean(li.querySelector('a.tickets')?.getAttribute('title'))
    }));
    return { title, showings };
}

async function scrapeEagleBank(browser) {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 900 }
    });
    const page = await context.newPage();
    const venueData = [];
    const seen = new Set();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isPast = (iso) => {
        const [y, m, d] = iso.split('-').map(Number);
        return new Date(y, m - 1, d) < today;
    };
    const addRow = (title, date, time, type) => {
        if (date !== 'TBA' && isPast(date)) return;
        const key = `${date}|${time}|${title}`;
        if (seen.has(key)) return;
        seen.add(key);
        venueData.push({ venue: 'EagleBank Arena', title, date, time, type });
        console.log(`✅ Kept: ${title} on ${date} (${time}) [${type}]`);
    };

    try {
        console.log('\n🚀 Scraping EagleBank Arena...');
        await page.goto(EBA_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });

        try {
            const cookieBtn = page.locator('#onetrust-accept-btn-handler, button:has-text("Accept")').first();
            if (await cookieBtn.isVisible({ timeout: 3000 })) await cookieBtn.click();
        } catch (e) {}

        const linkSelector = 'h3.title a[href*="/events/detail/"]';
        await page.waitForSelector(linkSelector, { timeout: 20000 });

        // ---- Click "More Events" until the button is gone
        const buttonPresent = () => page.evaluate(() => {
            const btn = document.querySelector('#loadMoreEvents');
            if (!btn) return false;
            const style = window.getComputedStyle(btn);
            return style.display !== 'none' && style.visibility !== 'hidden' && btn.offsetParent !== null;
        });
        let failedClicks = 0;
        for (let i = 0; i < 150; i++) {
            let present = await buttonPresent();
            for (let w = 0; !present && w < 6; w++) {
                await page.waitForTimeout(500);
                present = await buttonPresent();
            }
            if (!present) {
                console.log('   ↪︎ "More Events" button is gone, reached the end of the list.');
                break;
            }
            const before = await page.locator(linkSelector).count();
            await page.locator('#loadMoreEvents').scrollIntoViewIfNeeded().catch(() => {});
            await page.evaluate(() => document.querySelector('#loadMoreEvents')?.click());
            try {
                await page.waitForFunction(
                    ([sel, n]) => document.querySelectorAll(sel).length > n,
                    [linkSelector, before],
                    { timeout: 15000 }
                );
                failedClicks = 0;
                console.log(`   ↪︎ More Events: ${before} -> ${await page.locator(linkSelector).count()} events`);
            } catch {
                failedClicks++;
                console.log(`   ↪︎ More Events click added nothing (attempt ${failedClicks}/3)`);
                if (failedClicks >= 3) break;
            }
            await page.waitForTimeout(800);
        }

        // ---- Read the grid
        const allCards = await page.evaluate(extractEBACards);
        const cards = [];
        const seenUrls = new Set();
        for (const c of allCards) {
            if (seenUrls.has(c.url)) continue;
            seenUrls.add(c.url);
            cards.push(c);
        }
        const rangeCards = cards.filter(c => c.isRange);
        console.log(`📋 Found ${cards.length} EagleBank events (${rangeCards.length} with multiple dates).`);

        // Single-date events: straight from the card
        for (const c of cards.filter(c => !c.isRange)) {
            const days = parseDateRangeAOTW(c.dateText);
            if (days.length === 0) {
                console.log(`   ⚠️ No date on card for "${c.title}"`);
                continue;
            }
            addRow(c.title, days[0], formatTimeAOTW(c.startText), categorizeEBA(c.title));
        }

        // Multi-date events: open "More Info" and read every showing
        for (const c of rangeCards) {
            try {
                if (!(await gotoDetailWithRetry(page, c.url))) {
                    console.log('   ⚠️ Browser page was closed, stopping this venue.');
                    break;
                }
                const d = await page.evaluate(extractEBAShowings);
                const title = d.title || c.title;
                const type = categorizeEBA(title);

                if (d.showings.length === 0) {
                    // No showings list: one row per day of the range, with the card's time
                    const days = parseDateRangeAOTW(c.dateText);
                    for (const day of days) addRow(title, day, formatTimeAOTW(c.startText), type);
                    continue;
                }

                const rangeDays = parseDateRangeAOTW(c.dateText);
                const rangeYear = rangeDays.length ? parseInt(rangeDays[0].slice(0, 4), 10) : today.getFullYear();
                const rangeStartMonth = rangeDays.length ? parseInt(rangeDays[0].slice(5, 7), 10) : 1;

                for (const s of d.showings) {
                    let date = 'TBA';
                    const withYear = `${s.icalTitle} ${s.ticketTitle}`.match(/([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})/);
                    if (withYear && AOTW_MONTHS[withYear[1].toLowerCase().slice(0, 3)]) {
                        date = isoDateAOTW(withYear[3], AOTW_MONTHS[withYear[1].toLowerCase().slice(0, 3)], withYear[2]);
                    } else {
                        const md = s.dateText.match(/([A-Za-z]{3,})\s+(\d{1,2})/);
                        const month = md ? AOTW_MONTHS[md[1].toLowerCase().slice(0, 3)] : null;
                        if (month) {
                            const year = month < rangeStartMonth ? rangeYear + 1 : rangeYear;
                            date = isoDateAOTW(year, month, md[2]);
                        }
                    }
                    const time = formatTimeAOTW(s.timeText || s.icalTitle);
                    addRow(title, date, time, type);
                }
            } catch (err) {
                console.log(`   ⚠️ Skipped ${c.url}: ${err.message}`);
            }
        }

        console.log(`🏁 EagleBank Arena: ${venueData.length} rows.`);
    } catch (err) {
        console.error('❌ EagleBank Arena failed:', err.message);
    } finally {
        await page.close();
        await context.close();
    }

    return venueData;
}

// =========================================================================
// TEXAS A&M - REED ARENA (Ticketmaster)
// Venue page -> click "More Events" until it disappears -> read every event.
// Each event's "Find Tickets" link carries hidden text like
//   "Texas A&M Aggies Womens Basketball vs. ... , 11/5/26, 8:00 PM"
// which has the title, date and time together. Ticketmaster's class names
// (sc-xxxx) change often, so the scraper relies on data-testid and that text.
// Times on the page are already local (CT), so no time zone conversion.
// =========================================================================

const REED_URL = 'https://www.ticketmaster.com/reed-arena-tickets-college-station/venue/475425';

function categorizeReed(title) {
    const t = (title || '').toLowerCase().replace(/[’']/g, '');

    if (/womens? basketball|\bwbb\b/.test(t)) return 'NCAA WB';
    if (/volleyball/.test(t)) return 'NCAA WVB';
    if (/mens basketball|\bmbb\b/.test(t) || /\bbasketball\b/.test(t)) return 'NCAA MB';

    const concertWords = [
        'concert', 'tour', 'music', 'festival', 'live', 'band', 'symphony', 'orchestra', 'r&b',
        'jazz', 'gospel', 'hip hop', 'rap', 'country', 'rock', 'singer', 'tribute'
    ];
    if (concertWords.some(w => new RegExp(`(^|[^a-z])${w.replace(/[&]/g, '\\$&')}([^a-z]|$)`).test(t))) return 'Concert';

    return 'Other';
}

// Runs in the Ticketmaster page: one entry per "Find Tickets" link
function extractReedEvents() {
    const clean = s => (s || '').replace(/\s+/g, ' ').trim();
    return Array.from(document.querySelectorAll('a[data-testid="event-list-link"]')).map(a => {
        const hidden = a.querySelector('[class*="VisuallyHidden"]');
        return {
            href: a.href,
            label: clean(hidden ? hidden.textContent : a.textContent)
        };
    });
}

// "Title, 11/5/26, 8:00 PM" -> { title, date: '2026-11-05', time: '8:00PM' }
function parseReedLabel(label) {
    const text = (label || '').replace(/^(Find|See|Buy)\s+Tickets\s*/i, '').trim();
    const m = text.match(/^(.*?),\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:,\s*(.*))?$/);
    if (!m) return { title: text, date: 'TBA', time: 'TBA' };
    const year = m[4].length === 2 ? `20${m[4]}` : m[4];
    return {
        title: m[1].trim(),
        date: isoDateAOTW(year, parseInt(m[2], 10), parseInt(m[3], 10)),
        // Ticketmaster uses 12:00 AM as a placeholder for "time not announced"
        time: (formatTimeAOTW(m[5] || '') === '12:00AM') ? 'TBA' : formatTimeAOTW(m[5] || '')
    };
}

async function scrapeReedArena(browser) {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 900 }
    });
    const page = await context.newPage();
    const venueData = [];
    const seen = new Set();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        console.log('\n🚀 Scraping Texas A&M - Reed Arena (Ticketmaster)...');
        await page.goto(REED_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

        try {
            const cookieBtn = page.locator('#onetrust-accept-btn-handler, button:has-text("Accept")').first();
            if (await cookieBtn.isVisible({ timeout: 4000 })) await cookieBtn.click();
        } catch (e) {}

        const linkSelector = 'a[data-testid="event-list-link"]';
        try {
            await page.waitForSelector(linkSelector, { timeout: 30000 });
        } catch (e) {
            await page.screenshot({ path: 'reed_debug.png', fullPage: true }).catch(() => {});
            console.log(`   ⚠️ No events appeared (page title: "${await page.title()}"). Saved reed_debug.png`);
            throw e;
        }

        // ---- Click "More Events" until it disappears
        const moreBtn = page.locator('button').filter({ hasText: /^\s*More Events\s*$/i }).first();
        let failedClicks = 0;
        for (let i = 0; i < 100; i++) {
            let visible = await moreBtn.isVisible().catch(() => false);
            for (let w = 0; !visible && w < 6; w++) {
                await page.mouse.wheel(0, 3000);
                await page.waitForTimeout(500);
                visible = await moreBtn.isVisible().catch(() => false);
            }
            if (!visible) {
                console.log('   ↪︎ "More Events" is gone, all events loaded.');
                break;
            }

            const before = await page.locator(linkSelector).count();
            await moreBtn.scrollIntoViewIfNeeded().catch(() => {});
            await moreBtn.click({ timeout: 5000 }).catch(async () => {
                await moreBtn.evaluate(el => el.click()).catch(() => {});
            });

            try {
                await page.waitForFunction(
                    ([sel, n]) => document.querySelectorAll(sel).length > n,
                    [linkSelector, before],
                    { timeout: 15000 }
                );
                failedClicks = 0;
                console.log(`   ↪︎ More Events: ${before} -> ${await page.locator(linkSelector).count()} events`);
            } catch {
                failedClicks++;
                console.log(`   ↪︎ More Events click added nothing (attempt ${failedClicks}/3)`);
                if (failedClicks >= 3) break;
            }
            await page.waitForTimeout(800);
        }

        // ---- Read every event
        const events = await page.evaluate(extractReedEvents);
        console.log(`📋 Found ${events.length} Ticketmaster events for Reed Arena.`);

        let skippedParking = 0;
        for (const ev of events) {
            const { title, date, time } = parseReedLabel(ev.label);
            if (!title) continue;

            // Parking passes are listed as separate "events"
            if (/\bparking\b/i.test(title)) { skippedParking++; continue; }

            if (date !== 'TBA') {
                const [y, m, d] = date.split('-').map(Number);
                if (new Date(y, m - 1, d) < today) continue;
            }

            const type = categorizeReed(title);
            const key = `${date}|${time}|${title}`;
            if (seen.has(key)) continue;
            seen.add(key);

            venueData.push({ venue: 'Texas A&M - Reed Arena', title, date, time, type });
            console.log(`✅ Kept: ${title} on ${date} (${time}) [${type}]`);
        }

        console.log(`🏁 Reed Arena: ${venueData.length} rows${skippedParking ? ` (${skippedParking} parking listings skipped)` : ''}.`);
    } catch (err) {
        console.error('❌ Reed Arena failed:', err.message);
    } finally {
        await page.close();
        await context.close();
    }

    return venueData;
}

// =========================================================================
// UNM - THE PIT (Ticketmaster: Albuquerque sports listing)
// The page lists ALL Albuquerque sports events, so only events whose venue is
// "Albuquerque, NM The Pit (University Arena)" are kept.
// Click "More Events" until it disappears, then read every "Find Tickets" link.
// Each link has hidden text like:
//   "New Mexico Lobos Mens Basketball vs. Arkansas Little Rock Trojans Mens Basketball,
//    Albuquerque, NM The Pit (University Arena)11/10/26, 7:00 PM"
// Times on the page are already local (MT), so no time zone conversion.
// =========================================================================

const PIT_URL = 'https://www.ticketmaster.com/discover/albuquerque?categoryId=KZFzniwnSyZfZ7v7nE';

function categorizePit(title) {
    const t = (title || '').toLowerCase().replace(/[’']/g, '');

    if (/womens? basketball|\bwbb\b/.test(t)) return 'NCAA WB';
    if (/volleyball/.test(t)) return 'NCAA WVB';
    if (/mens basketball|\bmbb\b/.test(t) || /\bbasketball\b/.test(t)) return 'NCAA MB';

    const concertWords = [
        'concert', 'tour', 'music', 'festival', 'live', 'band', 'symphony', 'orchestra', 'r&b',
        'jazz', 'gospel', 'hip hop', 'rap', 'country', 'rock', 'singer', 'tribute'
    ];
    if (concertWords.some(w => new RegExp(`(^|[^a-z])${w.replace(/[&]/g, '\\$&')}([^a-z]|$)`).test(t))) return 'Concert';

    return 'Other';
}

// Runs in the Ticketmaster page: one entry per "Find Tickets" link, plus its row's text
function extractPitEvents() {
    const clean = s => (s || '').replace(/\s+/g, ' ').trim();
    return Array.from(document.querySelectorAll('a[data-testid="event-list-link"]')).map(a => {
        const hidden = a.querySelector('[class*="VisuallyHidden"]');
        const row = a.closest('li') || a.parentElement?.parentElement || a;
        return {
            label: clean(hidden ? hidden.textContent : a.textContent),
            rowText: clean(row.textContent)
        };
    });
}

// Splits "Title, Albuquerque, NM The Pit (University Arena)11/10/26, 7:00 PM"
function parsePitLabel(label) {
    const text = (label || '').replace(/^(Find|See|Buy)\s+Tickets\s*/i, '').trim();
    const dm = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:,\s*(.*))?$/);

    let before = dm ? text.slice(0, dm.index) : text;
    before = before.replace(/[,\s]+$/, '');

    // Title is everything before ", Albuquerque, NM" (or before any ", City, ST")
    let title = before;
    const cityIdx = before.search(/,\s*Albuquerque,\s*NM\b/i);
    if (cityIdx >= 0) {
        title = before.slice(0, cityIdx);
    } else {
        const generic = before.match(/^(.*?),\s*[A-Z][A-Za-z .'-]+,\s*[A-Z]{2}\b/);
        if (generic) title = generic[1];
    }

    let date = 'TBA', time = 'TBA';
    if (dm) {
        const year = dm[3].length === 2 ? `20${dm[3]}` : dm[3];
        date = isoDateAOTW(year, parseInt(dm[1], 10), parseInt(dm[2], 10));
        time = formatTimeAOTW(dm[4] || '');
        // Ticketmaster uses 12:00 AM as a placeholder for "time not announced"
        if (time === '12:00AM') time = 'TBA';
    }
    return { title: title.trim(), venueText: before, date, time };
}

async function scrapeThePit(browser) {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 900 }
    });
    const page = await context.newPage();
    const venueData = [];
    const seen = new Set();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        console.log('\n🚀 Scraping UNM - The Pit (Ticketmaster Albuquerque sports)...');
        await page.goto(PIT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

        try {
            const cookieBtn = page.locator('#onetrust-accept-btn-handler, button:has-text("Accept")').first();
            if (await cookieBtn.isVisible({ timeout: 4000 })) await cookieBtn.click();
        } catch (e) {}

        const linkSelector = 'a[data-testid="event-list-link"]';
        try {
            await page.waitForSelector(linkSelector, { timeout: 30000 });
        } catch (e) {
            await page.screenshot({ path: 'pit_debug.png', fullPage: true }).catch(() => {});
            console.log(`   ⚠️ No events appeared (page title: "${await page.title()}"). Saved pit_debug.png`);
            throw e;
        }

        // ---- Click "More Events" until it disappears
        const moreBtn = page.locator('button').filter({ hasText: /^\s*More Events\s*$/i }).first();
        let failedClicks = 0;
        for (let i = 0; i < 100; i++) {
            let visible = await moreBtn.isVisible().catch(() => false);
            for (let w = 0; !visible && w < 6; w++) {
                await page.mouse.wheel(0, 3000);
                await page.waitForTimeout(500);
                visible = await moreBtn.isVisible().catch(() => false);
            }
            if (!visible) {
                console.log('   ↪︎ "More Events" is gone, all Albuquerque events loaded.');
                break;
            }

            const before = await page.locator(linkSelector).count();
            await moreBtn.scrollIntoViewIfNeeded().catch(() => {});
            await moreBtn.click({ timeout: 5000 }).catch(async () => {
                await moreBtn.evaluate(el => el.click()).catch(() => {});
            });

            try {
                await page.waitForFunction(
                    ([sel, n]) => document.querySelectorAll(sel).length > n,
                    [linkSelector, before],
                    { timeout: 15000 }
                );
                failedClicks = 0;
                console.log(`   ↪︎ More Events: ${before} -> ${await page.locator(linkSelector).count()} events`);
            } catch {
                failedClicks++;
                console.log(`   ↪︎ More Events click added nothing (attempt ${failedClicks}/3)`);
                if (failedClicks >= 3) break;
            }
            await page.waitForTimeout(800);
        }

        // ---- Read every event, keep only The Pit
        const events = await page.evaluate(extractPitEvents);
        console.log(`📋 Found ${events.length} Albuquerque sports events on Ticketmaster.`);

        const PIT_RE = /Albuquerque,\s*NM\s*The Pit \(University Arena\)/i;
        let otherVenue = 0, skippedParking = 0;
        for (const ev of events) {
            const p = parsePitLabel(ev.label);
            if (!p.title) continue;

            const atPit = PIT_RE.test(ev.label) || PIT_RE.test(ev.rowText);
            if (!atPit) { otherVenue++; continue; }
            if (/\bparking\b/i.test(p.title)) { skippedParking++; continue; }

            if (p.date !== 'TBA') {
                const [y, m, d] = p.date.split('-').map(Number);
                if (new Date(y, m - 1, d) < today) continue;
            }

            const type = categorizePit(p.title);
            const key = `${p.date}|${p.time}|${p.title}`;
            if (seen.has(key)) continue;
            seen.add(key);

            venueData.push({ venue: 'UNM - The Pit', title: p.title, date: p.date, time: p.time, type });
            console.log(`✅ Kept: ${p.title} on ${p.date} (${p.time}) [${type}]`);
        }

        const notes = [`${otherVenue} at other Albuquerque venues skipped`];
        if (skippedParking) notes.push(`${skippedParking} parking listings skipped`);
        console.log(`🏁 The Pit: ${venueData.length} rows (${notes.join(', ')}).`);
    } catch (err) {
        console.error('❌ The Pit failed:', err.message);
    } finally {
        await page.close();
        await context.close();
    }

    return venueData;
}

// =========================================================================
// WICHITA STATE - KOCH ARENA (wichita.edu calendar, location 33 = Koch Arena)
// The page is already filtered to Koch Arena. Each event:
//   <time datetime="2026-11-04T06:30:00-06:00">6:30 p.m.</time> <span itemprop="name">Men's Basketball vs. CSUN</span>
// The datetime's hour is NOT reliable (6:30 p.m. shows as 06:30), so the date comes
// from datetime and the time from the visible text. Times are already local (CT).
// =========================================================================

const KOCH_URL = 'https://www.wichita.edu/calendar/index.php?com=location&lID=33';

function categorizeCollegeArena(title) {
    const t = (title || '').toLowerCase().replace(/[’']/g, '');

    // Women's first, because "womens" also contains "mens"
    if (/womens basketball|\bwbb\b/.test(t)) return 'NCAA WB';
    if (/mens basketball|\bmbb\b/.test(t)) return 'NCAA MB';

    const concertWords = [
        'concert', 'tour', 'music', 'festival', 'live', 'band', 'symphony', 'orchestra', 'r&b',
        'jazz', 'gospel', 'hip hop', 'rap', 'country', 'rock', 'singer', 'tribute'
    ];
    if (concertWords.some(w => new RegExp(`(^|[^a-z])${w.replace(/[&]/g, '\\$&')}([^a-z]|$)`).test(t))) return 'Concert';

    return 'Other';
}

// Runs in the wichita.edu page
function extractKochEvents() {
    const clean = s => (s || '').replace(/\s+/g, ' ').trim();
    return Array.from(document.querySelectorAll('li.wsu_cal_event_li')).map(li => {
        const timeEl = li.querySelector('time[itemprop="startDate"], time');
        return {
            title: clean(li.querySelector('[itemprop="name"]')?.textContent || li.querySelector('a')?.textContent),
            datetime: timeEl ? (timeEl.getAttribute('datetime') || '') : '',
            timeText: clean(timeEl?.textContent),
            href: li.querySelector('a[href]')?.href || ''
        };
    });
}

async function scrapeKochArena(browser) {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 900 }
    });
    const page = await context.newPage();
    const venueData = [];
    const seen = new Set();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        console.log('\n🚀 Scraping Wichita - Koch Arena (wichita.edu calendar)...');
        await page.goto(KOCH_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });

        try {
            await page.waitForSelector('li.wsu_cal_event_li', { timeout: 20000 });
        } catch (e) {
            await page.screenshot({ path: 'koch_debug.png', fullPage: true }).catch(() => {});
            console.log(`   ⚠️ No events appeared (page title: "${await page.title()}"). Saved koch_debug.png`);
            throw e;
        }

        const events = await page.evaluate(extractKochEvents);
        console.log(`📋 Found ${events.length} Koch Arena calendar entries.`);

        for (const ev of events) {
            if (!ev.title) continue;
            if (/\bparking\b/i.test(ev.title)) continue;

            const dm = ev.datetime.match(/^(\d{4})-(\d{2})-(\d{2})/);
            const date = dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : 'TBA';
            if (date !== 'TBA') {
                const [y, m, d] = date.split('-').map(Number);
                if (new Date(y, m - 1, d) < today) continue;
            }

            // "6:30 p.m." -> "6:30PM"; "All day" or no time -> TBA
            const time = formatTimeAOTW(ev.timeText.replace(/\s+/g, ''));
            const type = categorizeCollegeArena(ev.title);

            const key = `${date}|${time}|${ev.title}`;
            if (seen.has(key)) continue;
            seen.add(key);

            venueData.push({ venue: 'Wichita - Koch Arena', title: ev.title, date, time, type });
            console.log(`✅ Kept: ${ev.title} on ${date} (${time}) [${type}]`);
        }

        console.log(`🏁 Koch Arena: ${venueData.length} rows.`);
    } catch (err) {
        console.error('❌ Koch Arena failed:', err.message);
    } finally {
        await page.close();
        await context.close();
    }

    return venueData;
}

// =========================================================================
// WSU - BEASLEY COLISEUM (Vivid Seats venue page)
// eVenue blocks automated browsers ("Access to this page has been denied"),
// so this reads Vivid Seats instead. Each card has:
//   title  "Idaho Vandals at Washington State Cougars Womens Basketball"
//   date   "Mon Nov 9" • time "11:00AM"
//   venue  "Beasley Coliseum" • "Pullman, WA"
// Vivid Seats class names are generated (mui-xxxx), so the scraper finds cards by
// their title element and reads the date/time/venue by text pattern.
// Times on the page are already local (PT), so no time zone conversion.
// =========================================================================

const BEASLEY_URL = 'https://www.vividseats.com/beasley-coliseum-tickets/venue/163';

// Runs in the Vivid Seats page: one entry per event card
function extractBeasleyCards() {
    const clean = s => (s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const titleSel = '[class*="titleTruncate"]';
    // "Mon Nov 9" or, for next year's events, "Sun Feb 7, 2027"
    const DATE_RE = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?\s+([A-Z][a-z]{2,})\.?\s+(\d{1,2})(?:,\s*(\d{4}))?$/;

    return Array.from(document.querySelectorAll(titleSel)).map(titleEl => {
        // Climb to the card: the ancestor that has a date span and only this one title
        let card = titleEl;
        const hasDate = el => Array.from(el.querySelectorAll('span')).some(s => DATE_RE.test(clean(s.textContent)));
        while (card.parentElement && !hasDate(card)) {
            if (card.parentElement.querySelectorAll(titleSel).length > 1) break;
            card = card.parentElement;
        }

        const spans = Array.from(card.querySelectorAll('span')).map(s => clean(s.textContent)).filter(Boolean);
        const dateText = spans.find(t => DATE_RE.test(t)) || '';
        const timeText = spans.find(t => /^\d{1,2}:\d{2}\s*[AP]M$/i.test(t) || /^(TBD|TBA)$/i.test(t)) || '';
        const cardText = clean(card.textContent);

        return {
            title: clean(titleEl.textContent),
            dateText,
            timeText,
            atBeasley: /Beasley Coliseum/i.test(cardText),
            cardText
        };
    });
}

// "Mon Nov 9" has no year: this year, or next year if that date already passed
function vividDate(dateText) {
    // "Mon Nov 9" or "Sun Feb 7, 2027"
    const m = (dateText || '').match(/([A-Z][a-z]{2,})\.?\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
    if (!m) return 'TBA';
    const mo = AOTW_MONTHS[m[1].toLowerCase().slice(0, 3)];
    if (!mo) return 'TBA';
    const day = parseInt(m[2], 10);
    if (m[3]) return isoDateAOTW(m[3], mo, day);   // year shown on the card

    const today = new Date(); today.setHours(0, 0, 0, 0);
    let year = today.getFullYear();
    if (new Date(year, mo - 1, day) < today) year++;
    return isoDateAOTW(year, mo, day);
}

async function scrapeBeasley(browser) {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 900 }
    });
    const page = await context.newPage();
    const venueData = [];
    const seen = new Set();

    try {
        console.log('\n🚀 Scraping WSU - Beasley Coliseum (Vivid Seats)...');
        await page.goto(BEASLEY_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

        try {
            const cookieBtn = page.locator('#onetrust-accept-btn-handler, button:has-text("Accept")').first();
            if (await cookieBtn.isVisible({ timeout: 4000 })) await cookieBtn.click();
        } catch (e) {}

        const titleSel = '[class*="titleTruncate"]';
        try {
            await page.waitForSelector(titleSel, { state: 'attached', timeout: 45000 });
        } catch (e) {
            await page.screenshot({ path: 'beasley_debug.png', fullPage: true }).catch(() => {});
            console.log(`   ⚠️ No events appeared (page title: "${await page.title()}"). Saved beasley_debug.png`);
            throw e;
        }

        // Scroll to the bottom and click any "Load more"/"Show more" until nothing new appears
        let lastCount = await page.locator(titleSel).count();
        let stable = 0;
        for (let i = 0; i < 60 && stable < 3; i++) {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(1200);
            const more = page.locator('button').filter({ hasText: /^\s*(Load|Show|See|View) more/i }).first();
            if (await more.isVisible().catch(() => false)) {
                await more.click().catch(() => {});
                await page.waitForTimeout(1500);
            }
            const count = await page.locator(titleSel).count();
            if (count > lastCount) {
                console.log(`   ↪︎ Loaded more: ${lastCount} -> ${count} events`);
                lastCount = count; stable = 0;
            } else {
                stable++;
            }
        }

        const cards = await page.evaluate(extractBeasleyCards);
        console.log(`📋 Found ${cards.length} Vivid Seats listings for Beasley Coliseum.`);

        let otherVenue = 0, parking = 0;
        for (const c of cards) {
            if (!c.title) continue;
            if (!c.atBeasley) { otherVenue++; continue; }
            if (/\bparking\b/i.test(c.title)) { parking++; continue; }

            const date = vividDate(c.dateText);
            const time = formatTimeAOTW(c.timeText);   // "11:00AM"; TBD -> TBA
            const type = categorizeCollegeArena(c.title);

            const key = `${date}|${time}|${c.title}`;
            if (seen.has(key)) continue;
            seen.add(key);

            venueData.push({ venue: 'WSU - Beasley Coliseum', title: c.title, date, time, type });
            console.log(`✅ Kept: ${c.title} on ${date} (${time}) [${type}]`);
        }

        console.log(`🏁 Beasley Coliseum: ${venueData.length} rows (${otherVenue} other venues, ${parking} parking skipped).`);
    } catch (err) {
        console.error('❌ Beasley Coliseum failed:', err.message);
    } finally {
        await page.close();
        await context.close();
    }

    return venueData;
}

// =========================================================================
// BUTLER - HINKLE FIELDHOUSE (Ticketmaster venue page)
// Same Ticketmaster layout as Reed Arena: click "More Events" until it's gone,
// then read each "Find Tickets" link's hidden text:
//   "Butler University Bulldogs Womens Basketball vs. North Dakota State Bison Womens Basketball, 11/12/26, 7:00 PM"
// Reuses extractReedEvents() and parseReedLabel() (12:00 AM -> TBA).
// Times on the page are already local (ET), so no time zone conversion.
// =========================================================================

const HINKLE_URL = 'https://www.ticketmaster.com/hinkle-fieldhouse-tickets-indianapolis/venue/41118';

function categorizeHinkle(title) {
    const t = (title || '').toLowerCase().replace(/[’']/g, '');

    if (/womens? basketball|\bwbb\b/.test(t)) return 'NCAA WB';
    if (/volleyball/.test(t)) return 'NCAA WVB';
    if (/mens basketball|\bmbb\b/.test(t) || /\bbasketball\b/.test(t)) return 'NCAA MB';

    const concertWords = [
        'concert', 'tour', 'music', 'festival', 'live', 'band', 'symphony', 'orchestra', 'r&b',
        'jazz', 'gospel', 'hip hop', 'rap', 'country', 'rock', 'singer', 'tribute'
    ];
    if (concertWords.some(w => new RegExp(`(^|[^a-z])${w.replace(/[&]/g, '\\$&')}([^a-z]|$)`).test(t))) return 'Concert';

    return 'Other';
}

/*
async function scrapeHinkle(browser) {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 900 }
    });
    const page = await context.newPage();
    const venueData = [];
    const seen = new Set();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        console.log('\n🚀 Scraping Butler - Hinkle Fieldhouse (Ticketmaster)...');
        await page.goto(HINKLE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

        try {
            const cookieBtn = page.locator('#onetrust-accept-btn-handler, button:has-text("Accept")').first();
            if (await cookieBtn.isVisible({ timeout: 4000 })) await cookieBtn.click();
        } catch (e) {}

        const linkSelector = 'a[data-testid="event-list-link"]';
        try {
            await page.waitForSelector(linkSelector, { timeout: 30000 });
        } catch (e) {
            await page.screenshot({ path: 'hinkle_debug.png', fullPage: true }).catch(() => {});
            console.log(`   ⚠️ No events appeared (page title: "${await page.title()}"). Saved hinkle_debug.png`);
            throw e;
        }

        // ---- Click "More Events" until it disappears
        const moreBtn = page.locator('button').filter({ hasText: /^\s*More Events\s*$/i }).first();
        let failedClicks = 0;
        for (let i = 0; i < 100; i++) {
            let visible = await moreBtn.isVisible().catch(() => false);
            for (let w = 0; !visible && w < 6; w++) {
                await page.mouse.wheel(0, 3000);
                await page.waitForTimeout(500);
                visible = await moreBtn.isVisible().catch(() => false);
            }
            if (!visible) {
                console.log('   ↪︎ Hinkle: "More Events" is gone, all events loaded.');
                break;
            }

            const before = await page.locator(linkSelector).count();
            await moreBtn.scrollIntoViewIfNeeded().catch(() => {});
            await moreBtn.click({ timeout: 5000 }).catch(async () => {
                await moreBtn.evaluate(el => el.click()).catch(() => {});
            });

            try {
                await page.waitForFunction(
                    ([sel, n]) => document.querySelectorAll(sel).length > n,
                    [linkSelector, before],
                    { timeout: 15000 }
                );
                failedClicks = 0;
                console.log(`   ↪︎ Hinkle More Events: ${before} -> ${await page.locator(linkSelector).count()} events`);
            } catch {
                failedClicks++;
                console.log(`   ↪︎ Hinkle More Events click added nothing (attempt ${failedClicks}/3)`);
                if (failedClicks >= 3) break;
            }
            await page.waitForTimeout(800);
        }

        // ---- Read every event
        const events = await page.evaluate(extractReedEvents);
        console.log(`📋 Found ${events.length} Ticketmaster events for Hinkle Fieldhouse.`);

        let skippedParking = 0;
        for (const ev of events) {
            const { title, date, time } = parseReedLabel(ev.label);
            if (!title) continue;
            if (/\bparking\b/i.test(title)) { skippedParking++; continue; }

            if (date !== 'TBA') {
                const [y, m, d] = date.split('-').map(Number);
                if (new Date(y, m - 1, d) < today) continue;
            }

            const type = categorizeHinkle(title);
            const key = `${date}|${time}|${title}`;
            if (seen.has(key)) continue;
            seen.add(key);

            const timeET = time === 'TBA' ? 'TBA' : `${time} EST`;
            venueData.push({ venue: 'Butler - Hinkle Fieldhouse', title, date, time: timeET, type });
            console.log(`✅ Kept: ${title} on ${date} (${timeET}) [${type}]`);
        }

        console.log(`🏁 Hinkle Fieldhouse: ${venueData.length} rows${skippedParking ? ` (${skippedParking} parking listings skipped)` : ''}.`);
    } catch (err) {
        console.error('❌ Hinkle Fieldhouse failed:', err.message);
    } finally {
        await page.close();
        await context.close();
    }

    return venueData;
}


*/

// =========================================================================
// BUTLER - HINKLE FIELDHOUSE (butlersports.com SIDEARM calendar grid)
// Trial source to compare with the Ticketmaster version (scrapeHinkle).
// Rows are labelled 'Butler - Hinkle Fieldhouse (butlersports)' so the two
// sources can be told apart in the CSV.
//
// The calendar is built with Knockout, so each event <li> carries its data
// (date, time, sport, opponent, home/away). The scraper reads that data via
// ko.dataFor(); if it isn't available it falls back to reading the cell text.
// Kept: HOME games for the sports played at Hinkle (MBB, WBB, volleyball).
// Clicks "Next Month" to move through the season.
// Times are already local (ET); " EST" is added to match the Ticketmaster version.
// =========================================================================

const HINKLE_SIDEARM_URL = 'https://butlersports.com/calendar';
const HINKLE_SIDEARM_MONTHS = 8;   // Nov -> Jun covers basketball + volleyball

// Runs in the butlersports.com page: one entry per event in the grid
function extractHinkleSidearmEvents() {
    const clean = s => (s || '').toString().replace(/\s+/g, ' ').trim();
    const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];

    // Month/year shown at the top of the calendar (fallback for the DOM path)
    const bodyText = clean(document.querySelector('[class*="sidearm-calendar"]')?.textContent || document.body.textContent);
    const hm = bodyText.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
    const viewMonth = hm ? monthNames.indexOf(hm[1].toLowerCase()) : -1;
    const viewYear = hm ? parseInt(hm[2], 10) : NaN;

    const ko = window.ko;
    return Array.from(document.querySelectorAll('li.sidearm-calendar-table-cell-event')).map(li => {
        // ---- Preferred: the Knockout data behind the row
        let data = null;
        try { data = ko && ko.dataFor ? ko.dataFor(li) : null; } catch (e) {}
        if (data && data.date) {
            const unwrap = v => (ko && ko.unwrap ? ko.unwrap(v) : v);
            const sport = unwrap(data.sport) || {};
            const opp = unwrap(data.opponent) || {};
            const result = unwrap(data.result);
            return {
                source: 'ko',
                isoDate: clean(unwrap(data.date)).slice(0, 10),
                time: clean(unwrap(data.time)),
                sportShort: clean(sport.short_display || sport.abbrev || ''),
                sportTitle: clean(sport.title || ''),
                atVs: clean(unwrap(data.at_vs)),
                opponent: clean(`${opp.prefix || ''} ${opp.title || ''}`),
                location: clean(unwrap(data.location)),
                home: unwrap(data.location_indicator) === 'H' || li.classList.contains('sidearm-calendar-table-cell-event-home'),
                hasResult: !!(result && result.status),
                status: clean(unwrap(data.status))
            };
        }

        // ---- Fallback: read the text in the cell
        const spans = Array.from(li.querySelectorAll('p:first-of-type span')).map(s => clean(s.textContent));
        const ps = Array.from(li.querySelectorAll(':scope > p')).map(p => clean(p.textContent));
        const cell = li.closest('td') || li.parentElement?.closest('[class*="cell"]');
        const dayNum = parseInt(clean(cell?.querySelector('time')?.textContent), 10);
        let isoDate = '';
        if (dayNum && viewMonth >= 0) {
            isoDate = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
        }
        const resultText = ps[2] || '';
        return {
            source: 'dom',
            isoDate,
            time: (resultText.match(/\d{1,2}(?::\d{2})?\s*[AP]\.?M\.?|TBA|TBD/i) || [''])[0],
            sportShort: spans[0] || '',
            sportTitle: '',
            atVs: spans[1] || '',
            opponent: clean(spans.slice(2).join(' ')),
            location: ps[1] || '',
            home: li.classList.contains('sidearm-calendar-table-cell-event-home'),
            hasResult: /\b[WLT]\s+\d+-\d+/.test(resultText),
            status: '',
            outsideMonth: !!(cell && /other|disabled|inactive|prev|next/i.test(cell.className))
        };
    });
}

function hinkleSportInfo(sportShort, sportTitle) {
    const s = `${sportShort} ${sportTitle}`.toLowerCase().replace(/[’']/g, '');
    if (/\bwbb\b|womens basketball/.test(s)) return { type: 'NCAA WB', name: "Women's Basketball" };
    if (/\bmbb\b|mens basketball/.test(s)) return { type: 'NCAA MB', name: "Men's Basketball" };
    if (/\b(wvb|vb|wvball)\b|volleyball/.test(s)) return { type: 'NCAA WVB', name: 'Volleyball' };
    return null;   // other sports aren't played at Hinkle
}

async function scrapeHinkle(browser) {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 900 }
    });
    const page = await context.newPage();
    const venueData = [];
    const seen = new Set();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        console.log('\n🚀 Scraping Butler - Hinkle Fieldhouse (butlersports.com calendar)...');
        await page.goto(HINKLE_SIDEARM_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });

        try {
            const cookieBtn = page.locator('#onetrust-accept-btn-handler, button:has-text("Accept")').first();
            if (await cookieBtn.isVisible({ timeout: 4000 })) await cookieBtn.click();
        } catch (e) {}

        const eventSel = 'li.sidearm-calendar-table-cell-event';
        try {
            await page.waitForSelector(eventSel, { state: 'attached', timeout: 30000 });
        } catch (e) {
            await page.screenshot({ path: 'hinkle_sidearm_debug.png', fullPage: true }).catch(() => {});
            console.log(`   ⚠️ No calendar events appeared (page title: "${await page.title()}"). Saved hinkle_sidearm_debug.png`);
            throw e;
        }

        let otherSport = 0, away = 0, past = 0;

        for (let m = 0; m < HINKLE_SIDEARM_MONTHS; m++) {
            await page.waitForTimeout(1200);
            const events = await page.evaluate(extractHinkleSidearmEvents);
            const via = events.length ? events[0].source : '-';
            console.log(`📅 Hinkle (butlersports) month ${m + 1}: ${events.length} events in the grid (read via ${via})`);

            for (const ev of events) {
                if (ev.outsideMonth) continue;

                const sport = hinkleSportInfo(ev.sportShort, ev.sportTitle);
                if (!sport) { otherSport++; continue; }

                // Home games only (Hinkle is in Indianapolis)
                const atHome = ev.home || /^vs\.?$/i.test(ev.atVs);
                if (!atHome || (ev.location && !/indianapolis/i.test(ev.location))) { away++; continue; }

                if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.isoDate)) continue;
                const [y, mo, d] = ev.isoDate.split('-').map(Number);
                if (ev.hasResult || new Date(y, mo - 1, d) < today) { past++; continue; }

                const opponent = ev.opponent || 'TBA';
                const title = `Butler ${sport.name} vs. ${opponent}`;
                const baseTime = formatTimeAOTW(ev.time);          // "7PM" -> "7:00PM"; TBA stays TBA
                const time = baseTime === 'TBA' ? 'TBA' : `${baseTime} EST`;

                const key = `${ev.isoDate}|${title}`;
                if (seen.has(key)) continue;
                seen.add(key);

                venueData.push({
                    venue: 'Butler - Hinkle Fieldhouse',
                    title,
                    date: ev.isoDate,
                    time,
                    type: sport.type
                });
                console.log(`✅ Kept: ${title} on ${ev.isoDate} (${time}) [${sport.type}]`);
            }

            // ---- Next month
            const nextBtn = page.locator('button.slick-next, button:has-text("Next Month")').first();
            if (!(await nextBtn.isVisible().catch(() => false))) break;
            const before = await page.evaluate(sel => Array.from(document.querySelectorAll(sel)).map(li => li.textContent).join('|').slice(0, 2000), eventSel);
            await nextBtn.click().catch(async () => { await nextBtn.evaluate(el => el.click()).catch(() => {}); });
            await page.waitForFunction(
                ([sel, prev]) => Array.from(document.querySelectorAll(sel)).map(li => li.textContent).join('|').slice(0, 2000) !== prev,
                [eventSel, before],
                { timeout: 10000 }
            ).catch(() => {});
        }

        console.log(`🏁 Hinkle (butlersports): ${venueData.length} rows (${otherSport} other sports, ${away} away, ${past} past skipped).`);
    } catch (err) {
        console.error('❌ Hinkle (butlersports) failed:', err.message);
    } finally {
        await page.close();
        await context.close();
    }

    return venueData;
}

// =========================================================================
// MAIN EXECUTION
// =========================================================================
if (require.main === module) {
    (async () => {
        const browser = await chromium.launch({ headless: false });

        const results = await Promise.all([
            scrapeAngelOfTheWinds(browser),
            scrapeFirstHorizon(browser),
            scrapeEagleBank(browser),
            scrapeReedArena(browser),
            scrapeThePit(browser),
            scrapeKochArena(browser),
            scrapeBeasley(browser),
            scrapeHinkle(browser),
            //scrapeHinkleSidearm(browser)
        ]);

        const allData = results.flat();
        console.log(`\n🏁 Total events scraped: ${allData.length}`);

        const csvWriter = createCsvWriter({
            path: 'calendar-5.csv',
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
            console.log('💾 Saved to calendar-5.csv');
        } else {
            console.log('⚠️ No records to write.');
        }

        await browser.close();
    })();
}

module.exports = { scrapeAngelOfTheWinds, scrapeFirstHorizon, scrapeEagleBank, scrapeReedArena, scrapeThePit, scrapeKochArena, scrapeBeasley, scrapeHinkle };
