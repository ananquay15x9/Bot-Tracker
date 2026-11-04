const { chromium } = require('playwright');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// =========================================================================
// ANGEL OF THE WINDS ARENA (Everett, WA)
// List page -> click "More Events" until everything is loaded -> open each
// event's detail page -> read title, date(s) and time(s).
// Times on the site are already local (PT), so no time zone conversion.
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
//   "November 13 - 15, 2026"              -> [2026-11-13, 2026-11-14, 2026-11-15]
//   "November 30 - December 2, 2026"      -> [2026-11-30, 2026-12-01, 2026-12-02]
//   "December 31, 2026 - January 2, 2027" -> [2026-12-31, 2027-01-01, 2027-01-02]
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

    const title = clean(document.querySelector('h1.title')?.textContent);

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
        for (const url of detailUrls) {
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForSelector('h1.title', { timeout: 15000 });

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

        console.log(`🏁 Angel of the Winds: ${venueData.length} rows.`);
    } catch (err) {
        console.error('❌ Angel of the Winds failed:', err.message);
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
            scrapeAngelOfTheWinds(browser)
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

module.exports = { scrapeAngelOfTheWinds };
