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

    return (now.getMonth() + 1) >= 8 ? now.getFullYear() + 1 : now.getFullYear();
}

function yearForText(text, now = new Date()) {
    const m = String(text || '').match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{1,2})?/i);
    if (!m) return now.getFullYear();
    return seasonYearFor(MONTH_NUMBERS[m[1].toLowerCase()], m[2] ? parseInt(m[2], 10) : 1, now);
}

// Removes rows that are exact copies of one another (same venue, title, date, time and type).
function dedupeRows(rows) {
    const seen = new Set();
    const unique = [];
    for (const row of rows) {
        const key = [row.venue, row.title, row.date, row.time, row.type].join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(row);
    }
    return unique;
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
function getAcademicYear() {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    if (currentMonth >= 7) {
        return { firstHalf: currentYear, secondHalf: currentYear + 1 };
    } else {
        return { firstHalf: currentYear - 1, secondHalf: currentYear };
    }
}

// Determine which year a month falls into based on academic calendar
function getYearForMonth(monthStr) {
    const academicYear = getAcademicYear();
    if (['aug', 'sep', 'oct', 'nov', 'dec'].includes(monthStr)) {
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
    return `${seasonYearFor(parseInt(month, 10), parseInt(day, 10))}-${month}-${day}`;
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


// Clean function for Auburn opponent names
function toTitleCase(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function cleanAuburnOpponent(rawText) {
    if (!rawText) return "Opponent TBD";

    let clean = rawText
        .replace(/opens\s+in\s+a\s+new\s+window/gi, '')
        .replace(/#\d+/g, '')
        .replace(/^(vs\.|at)/i, '')
        .replace(/\b(Wear Orange|Wear White|Wear Navy|All Auburn|Holiday Bleacher Game|Aubie Bobblehead Night|Tipoff on the Plains|Comedy Night for the Troops|Military Appreciation|Senior Day|Alumni Night|Preview Meet|Exhibition|Scrimmage)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    return toTitleCase(clean);
}

function parseAuburnDate(rawDateStr, fallbackMonth = '') {
    if (!rawDateStr || rawDateStr === 'TBA') return 'TBA';

    // Normalize whitespace and newlines (e.g. "Dec\n18" -> "Dec 18")
    let cleaned = rawDateStr.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    cleaned = cleaned.replace(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?/i, '').trim();

    const monthMap = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
    };

    if (/^\d{1,2}$/.test(cleaned) && fallbackMonth) {
        cleaned = `${fallbackMonth} ${cleaned}`;
    }

    const match = cleaned.match(/([A-Za-z]{3,9})\.?\s*(\d{1,2})/i);
    if (match) {
        const monthKey = match[1].toLowerCase().substring(0, 3);
        const month = monthMap[monthKey];
        const day = match[2].padStart(2, '0');
        
        // Aug - Dec belong to the season that began on the last July 1; Jan - Jun to the following year
        const year = String(seasonYearFor(parseInt(month, 10), parseInt(day, 10)));

        if (month) {
            return `${year}-${month}-${day}`;
        }
    }

    return formatDate(cleaned);
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


// Converts browser-localized Central Time to venue Mountain Time (-1 hour)
function convertCentralToMountain(timeStr) {
    if (!timeStr || timeStr.toUpperCase().includes('TBA')) return 'TBA';

    let clean = timeStr.toUpperCase().replace(/\./g, '').trim();
    const match = clean.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (!match) return timeStr;

    let hours = parseInt(match[1], 10);
    const minutes = match[2] || '00';
    const ampm = match[3].toUpperCase();

    // Convert to 24-hour format
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    // Step back -1 hour (CT -> MT)
    hours = (hours - 1 + 24) % 24;

    // Convert back to 12-hour format
    const newAmpm = hours >= 12 ? 'PM' : 'AM';
    let newHours = hours % 12;
    if (newHours === 0) newHours = 12;

    return `${newHours}:${minutes}${newAmpm}`;
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
        console.log(`\n⚔️ Scraping John Paul Jones Arena...`);
        await setupTranscendKiller(page);

        await page.goto('https://virginiasports.com/all-sports-schedule?type=home', { 
            waitUntil: 'domcontentloaded', 
            timeout: 45000 
        });

        // Dismiss cookie overlays
        try {
            const cookieBtn = page.locator('.iubenda-cs-accept-btn, button:has-text("Accept")').first();
            if (await cookieBtn.isVisible({ timeout: 3000 })) await cookieBtn.click();
            await page.addStyleTag({ content: '#iubenda-cs-banner, .iubenda-cs-default, .iubenda-cs-overlay { display: none !important; }' });
        } catch (e) {}

        const cardSelector = '.schedule-event-item';
        await page.waitForSelector(cardSelector, { timeout: 15000 }).catch(() => {});

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
        console.log(`📋 Found ${rows.length} JPJ schedule rows. Filtering for home arena sports...`);

        const seenEvents = new Set();

        for (const row of rows) {
            try {
                // 1. Location & Venue Verification
                const locText = (await row.locator('.schedule-event-location').first().innerText().catch(() => "")).trim();
                const venueText = (await row.locator('.schedule-event-item__venue').first().innerText().catch(() => "")).trim();
                const combinedLoc = `${locText} ${venueText}`.toUpperCase();

                // Must be a home event in Charlottesville
                if (!combinedLoc.includes('CHARLOTTESVILLE') && !combinedLoc.includes('HOME')) {
                    continue;
                }

                // 2. Sport Check (Basketball & Wrestling take place at JPJ)
                const sportLoc = row.locator('.schedule-event-item-links__sport-name, .schedule-default-event__sport, .sport-name, a[href*="/sports/"]').first();
                let rawSport = (await sportLoc.count() > 0) ? (await sportLoc.innerText()).trim() : "";

                const rowAllText = await row.innerText();
                if (!rawSport) {
                    if (rowAllText.toLowerCase().includes("women's basketball")) rawSport = "Women's Basketball";
                    else if (rowAllText.toLowerCase().includes("men's basketball")) rawSport = "Men's Basketball";
                    else if (rowAllText.toLowerCase().includes("wrestling")) rawSport = "Wrestling";
                }

                const jpjSports = ["Men's Basketball", "Women's Basketball", "Wrestling", "MBB", "WBB"];
                const isJPJSport = jpjSports.some(s => rawSport.toLowerCase().includes(s.toLowerCase()));

                if (!isJPJSport && rawSport !== "") continue;

                // 3. Opponent Extraction
                const opponentLoc = row.locator('.schedule-default-event__name, .schedule-default-event__opponent-name').first();
                let rawOpponent = (await opponentLoc.count() > 0) ? (await opponentLoc.innerText()).trim() : "";
                if (!rawOpponent) continue;

                const opponent = cleanOpponent(rawOpponent);

                // 4. Date Extraction: Target .schedule-event-date__month-day 
                const monthDayLoc = row.locator('.schedule-event-date__month-day').first();
                if (await monthDayLoc.count() === 0) continue;
                const rawMonthDay = (await monthDayLoc.innerText()).trim(); // e.g. "Nov 2"

                const monthKey = rawMonthDay.split(' ')[0].toLowerCase().substring(0, 3);
                // Aug - Dec belong to the season that began on the last July 1; Jan - Jun to the following year
                const year = String(yearForText(rawMonthDay));
                const cleanDate = formatDate(`${rawMonthDay} ${year}`);

                // 5. Time Extraction (Preserves "6:00 PM EST")
                let cleanTime = "TBA";
                const timeLabel = row.locator('.schedule-event-item-result__label, strong:has-text("PM"), strong:has-text("AM")').first();
                if (await timeLabel.count() > 0) {
                    const timeText = (await timeLabel.innerText()).trim();
                    const match = timeText.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)(?:\s+[A-Z]{2,4})?)/i);
                    if (match) {
                        cleanTime = match[1].replace(/\s+/g, ' ').toUpperCase();
                    }
                }

                // Filter past events
                if (cleanDate !== "TBA" && new Date(cleanDate) < today) {
                    continue;
                }

                // Determine sport category & clean title
                let eventType = 'Other';
                let sportTag = "";

                if (rawSport.toLowerCase().includes("women") || rawSport.toLowerCase().includes("wbb")) {
                    eventType = 'NCAA WB';
                    sportTag = "(Women's Basketball)";
                } else if (rawSport.toLowerCase().includes("men") || rawSport.toLowerCase().includes("mbb")) {
                    eventType = 'NCAA MB';
                    sportTag = "(Men's Basketball)";
                } else if (rawSport.toLowerCase().includes("wrestling")) {
                    eventType = 'Wrestling';
                    sportTag = "(Wrestling)";
                }

                const finalTitle = `Virginia vs. ${opponent} ${sportTag}`.trim();
                const dedupeKey = `${cleanDate}-${finalTitle}`;

                if (seenEvents.has(dedupeKey)) continue;
                seenEvents.add(dedupeKey);

                venueData.push({
                    venue: 'Virginia - John Paul Jones',
                    title: finalTitle,
                    date: cleanDate,
                    time: cleanTime,
                    type: eventType
                });

                console.log(`✅ Kept: ${finalTitle} on ${cleanDate} (${cleanTime}) [${eventType}]`);

            } catch (err) {
                continue;
            }
        }

    } catch (e) { 
        console.log(`❌ John Paul Jones Arena failed: ${e.message}`); 
    } finally {
        await page.close();
    }

    return venueData;
}

// 2. Virginia Tech - Cassell Coliseum
async function scrapeVT(browser) {
    const page = await browser.newPage();
    const venueData = [];
    const monthsToScrape = 12;
    const now = new Date();
    // Start at the CURRENT month and read 12 months forward
    const targetStartMonth = `${now.toLocaleString('en-US', { month: 'long' })} ${now.getFullYear()}`;
    const today = now.toISOString().split('T')[0];

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

            const monthIndex = (text) => {
                const [m, y] = text.trim().split(/\s+/);
                return parseInt(y, 10) * 12 + new Date(Date.parse(m + " 1, 2012")).getMonth();
            };
            const targetIndex = monthIndex(targetStartMonth);
            while (!monthYearText.includes(targetStartMonth) && safetyCounter < 24) {
                const navBtn = monthIndex(monthYearText) > targetIndex
                    ? page.locator('.schedule-calendar-navigation__button').first()   // go back
                    : page.locator('.schedule-calendar-navigation__button').last();   // go forward

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
                    if (cleanDate < today) continue;

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
                const year = dateMatch[3] || yearForText(`${month} ${day}`);
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



// 4. Real Salt Lake (America First Field - Men's MLS)
async function scrapeRSL(browser) {
    const page = await browser.newPage();
    const venueData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        console.log(`\n🚀 Scraping Real Salt Lake Schedule (America First Field)...`);
        await page.goto('https://www.rsl.com/schedule/#competition=all', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        await page.waitForSelector('.mls-c-match-list__match, .mls-c-match-tile', { timeout: 15000 });
        await page.waitForTimeout(2000);

        const readMatches = () => page.evaluate(() => {
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

                const statusEl = card.querySelector('.mls-c-status-stamp__status');
                const statusText = statusEl ? statusEl.innerText.trim() : "";

                const homeClubEl = card.querySelector('.mls-c-club.--home .mls-c-club__shortname, .mls-c-club.--home .mls-c-club__name');
                const awayClubEl = card.querySelector('.mls-c-club.--away .mls-c-club__shortname, .mls-c-club.--away .mls-c-club__name');
                
                const homeTeam = homeClubEl ? homeClubEl.innerText.trim() : "";
                const awayTeam = awayClubEl ? awayClubEl.innerText.trim() : "";

                const scorebugEl = card.querySelector('.mls-c-scorebug span, [class*="scorebug"] span');
                const rawTime = scorebugEl ? scorebugEl.innerText.trim() : "TBA";

                const infoParagraphs = card.querySelectorAll('.mls-c-match-list__match-info p');
                let competition = "";
                let venue = "";

                if (infoParagraphs.length > 0) {
                    competition = infoParagraphs[0].innerText.trim();
                    venue = infoParagraphs[infoParagraphs.length - 1].innerText.trim();
                }

                if (homeTeam && (href || statusText)) {
                    results.push({ urlDate, statusText, homeTeam, awayTeam, rawTime, competition, venue });
                }
            });
            return results;
        });

        const rawMatches = await readMatches();

        // The date lives in the page's web address: step it forward
        // and read what each date shows. If changing it has no effect on the page, give up early and say so.
        const matchKey = (m) => `${m.urlDate}|${m.homeTeam}|${m.awayTeam}`;
        const known = new Set(rawMatches.map(matchKey));
        const baseKeys = [...known].sort().join(',');
        const baseUrl = page.url();
        const dateInUrl = /\d{4}-\d{2}-\d{2}/;
        console.log(`🔎 The schedule page's address: ${baseUrl}`);
        let ignored = 0;
        for (let step = 1; step <= 18 && ignored < 3; step++) {      // every 15 days, about 9 months ahead
            const iso = new Date(today.getTime() + step * 15 * 86400000).toISOString().slice(0, 10);
            const next = dateInUrl.test(baseUrl)
                ? baseUrl.replace(dateInUrl, iso)
                : baseUrl + (baseUrl.includes('#') ? (/[#&]$/.test(baseUrl) ? '' : '&') : '#') + `date=${iso}`;
            try {
                await page.goto(next, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForSelector('.mls-c-match-list__match, .mls-c-match-tile', { timeout: 8000 });
                await page.waitForTimeout(1200);
                const more = await readMatches();
                const keys = more.map(matchKey).sort().join(',');
                let added = 0;
                for (const m of more) { const k = matchKey(m); if (!known.has(k)) { known.add(k); rawMatches.push(m); added++; } }
                console.log(`   ${iso}: ${more.length} fixtures shown, ${added} new`);
                ignored = (keys === baseKeys) ? ignored + 1 : 0;
            } catch (e) {
                console.log(`   ${iso}: nothing shown (${e.message.split('\n')[0].substring(0, 60)})`);
            }
        }
        if (ignored >= 3) console.log('   ⚠️ changing the date in the address does not change what the page shows - stopped looking ahead');

        console.log(`📋 Found ${rawMatches.length} raw RSL fixtures. Normalizing...`);
        const seenEvents = new Set();

        for (const match of rawMatches) {
            const venueLower = match.venue.toLowerCase();
            const isAmericaFirstField = venueLower.includes('america first field') || 
                                        venueLower.includes('riot') || 
                                        venueLower.includes('rio tinto') ||
                                        (match.homeTeam.toLowerCase().includes('salt lake') && !venueLower.includes('stadium') && !venueLower.includes('field'));

            if (!isAmericaFirstField) continue;

            let cleanDate = match.urlDate;
            if (!cleanDate && match.statusText.includes('/')) {
                const parts = match.statusText.split('/');
                const month = parts[0].padStart(2, '0');
                const day = parts[1].padStart(2, '0');
                const year = String(seasonYearFor(parseInt(month, 10), parseInt(day, 10)));
                cleanDate = `${year}-${month}-${day}`;
            }

            // Convert browser-rendered CT back to local venue MT (-1 hr)
            const cleanTime = convertCentralToMountain(match.rawTime);

            if (cleanDate !== "TBA" && new Date(cleanDate) < today) continue;

            const cleanType = categorizeRSL(match.competition);
            
            let awayFormatted = toTitleCase(match.awayTeam);
            if (awayFormatted.toLowerCase() === 'la galaxy') awayFormatted = 'LA Galaxy';
            awayFormatted = awayFormatted.replace(/\b(Fc|Sc|Cf)\b/g, (m) => m.toUpperCase()).replace(/\bLafc\b/, 'LAFC');   // Austin FC, St. Louis City SC, Inter Miami CF, LAFC

            const eventTitle = `Salt Lake vs. ${awayFormatted}`;
            const dedupeKey = `${cleanDate}-${cleanTime}-${eventTitle}`;

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
    } catch (e) { 
        console.log(`❌ RSL failed: ${e.message}`); 
    } finally {
        await page.close();
    }
    return venueData;
}

// 5. America First Field Women
async function scrapeRSLW(browser) {
    const page = await browser.newPage();
    const royalsData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    try {
        console.log(`\n👑 Navigating to Utah Royals Schedule...`);
        // Avoid networkidle to prevent 45000ms timeouts on tracking scripts
        await page.goto('https://www.rsl.com/utahroyals/schedule/#competition=all', { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000 
        });


        // Wait for table body or MLS tiles
        await page.waitForSelector('tbody tr, .mls-c-match-list__match, .mls-c-match-tile', { timeout: 15000 }).catch(() => {
            console.log("ℹ️ Schedule container slow to paint, evaluating existing DOM...");

        });

        await page.waitForTimeout(2000);
        const rawRows = await page.evaluate(() => {
            const results = [];
            // Method A: Check standard HTML table
            const trs = document.querySelectorAll('tbody tr');
            trs.forEach(row => {
                const dateCell = row.querySelector('td[data-label="Date"], td:nth-child(1)');
                const homeCell = row.querySelector('td[data-label="Home Team"], td:nth-child(2)');
                const awayCell = row.querySelector('td[data-label="Away Team"], td:nth-child(3)');
                const timeCell = row.querySelector('td[data-label="Time"], td:nth-child(4)');
                const placeCell = row.querySelector('td[data-label="Place"], td:nth-child(5)');

                const rawDate = dateCell ? dateCell.innerText.trim() : "";
                const home = homeCell ? homeCell.innerText.trim() : "";
                const away = awayCell ? awayCell.innerText.trim() : "";
                const time = timeCell ? timeCell.innerText.trim() : "TBA";
                const place = placeCell ? placeCell.innerText.trim() : "";


                if (rawDate && (home || away)) {
                    results.push({ rawDate, home, away, time, place });
                }
            });


            // Method B: Check MLS modern card tiles
            const tiles = document.querySelectorAll('.mls-c-match-list__match, .mls-c-match-tile');
            tiles.forEach(tile => {
                const link = tile.querySelector('a[href*="/matches/"]');
                const href = link ? link.href : "";
                let urlDate = "";
                const dateMatch = href.match(/(\d{2})-(\d{2})-(\d{4})/);
                if (dateMatch) {
                    urlDate = `${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}`;
                }


                const statusText = tile.querySelector('.mls-c-status-stamp__status')?.innerText.trim() || "";
                const home = tile.querySelector('.--home .mls-c-club__shortname, .--home .mls-c-club__name')?.innerText.trim() || "";
                const away = tile.querySelector('.--away .mls-c-club__shortname, .--away .mls-c-club__name')?.innerText.trim() || "";
                const time = tile.querySelector('.mls-c-scorebug span')?.innerText.trim() || "TBA";

                const infoParagraphs = tile.querySelectorAll('.mls-c-match-list__match-info p');
                const place = infoParagraphs.length > 0 ? infoParagraphs[infoParagraphs.length - 1].innerText.trim() : "";

                if (home && (urlDate || statusText)) {
                    results.push({
                        rawDate: urlDate || statusText,
                        home,
                        away,
                        time,
                        place
                    });
                }
            });


            return results;

        });

        console.log(`📋 Found ${rawRows.length} total Utah Royals match rows on page.`);
        const seenEvents = new Set();

        for (const item of rawRows) {
            const placeUpper = item.place.toUpperCase();
            const homeUpper = item.home.toUpperCase();


            // Strict Home Venue Filtering: America First Field
            const isHome = placeUpper.includes('AMERICA FIRST FIELD') || 
                           placeUpper.includes('RIO TINTO') || 
                           (homeUpper.includes('ROYALS') && !placeUpper.includes('STADIUM') && !placeUpper.includes('PARK') && !placeUpper.includes('FIELD'));


            if (!isHome) continue;
            let cleanDate = "TBA";
            if (/^\d{4}-\d{2}-\d{2}$/.test(item.rawDate)) {
                cleanDate = item.rawDate;
            } else if (item.rawDate.includes('/')) {
                const parts = item.rawDate.match(/(\d{1,2})\/(\d{1,2})/);
                if (parts) {
                    const month = parts[1].padStart(2, '0');
                    const day = parts[2].padStart(2, '0');
                    const year = String(seasonYearFor(parseInt(month, 10), parseInt(day, 10)));
                    cleanDate = `${year}-${month}-${day}`;
                }
            } else {
                cleanDate = formatDate(item.rawDate);
            }


            const cleanTime = formatTime(item.time);
            // Filter out past matches
            if (cleanDate !== "TBA" && new Date(cleanDate) < today) continue;
            const homeTitle = "Utah Royals";
            let awayTitle = item.away ? cleanOpponent(item.away) : "Opponent TBD";
            awayTitle = toTitleCase(awayTitle);

            const fullTitle = `${homeTitle} vs. ${awayTitle}`;
            const dedupeKey = `${cleanDate}-${cleanTime}-${fullTitle}`;


            if (seenEvents.has(dedupeKey)) continue;
            seenEvents.add(dedupeKey);


            royalsData.push({
                venue: 'America First Field',
                title: fullTitle,
                date: cleanDate,
                time: cleanTime,
                type: 'NWSL'

            });

            console.log(`✅ Kept: ${fullTitle} on ${cleanDate} (${cleanTime}) [NWSL]`);

        }


        if (royalsData.length === 0) {
            console.log(`ℹ️ Utah Royals 2026 regular season at America First Field is complete. 2027 NWSL home dates are not yet published.`);
        } else {
            console.log(`🏁 Successfully collected ${royalsData.length} upcoming Utah Royals home fixtures.`);

        }


    } catch (e) {
        console.log(`❌ Utah Royals failed: ${e.message}`);
    } finally {
        await page.close();

    }

    return royalsData;
}

// Scrape Auburn (combine all Auburn sports schedules)
async function scrapeAuburnSport(browser, url, sportType, defaultSportName) {
    const page = await browser.newPage();
    const venueData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        console.log(`\n🦅 Scraping Auburn (${defaultSportName})...`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });

        try {
            const cookieBtn = page.locator('button.iubenda-cs-accept-btn, #onetrust-accept-btn-handler');
            if (await cookieBtn.isVisible({ timeout: 3000 })) await cookieBtn.click();
        } catch (e) {}

        await page.waitForSelector('.schedule-event-item, .schedule-event-date', { timeout: 15000 }).catch(() => {});

        const rawEvents = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('.schedule-event-item');

            cards.forEach(card => {
                // 1. Home Game Verification
                const locEl = card.querySelector('.schedule-event-item__location, .schedule-event-location');
                const locText = locEl ? locEl.innerText.toUpperCase() : "";
                const isHome = locText.includes('NEVILLE ARENA') || locText.includes('AUBURN, AL');

                if (!isHome) return;

                // 2. Opponent (Excludes Promo Titles)
                const oppEl = card.querySelector('.schedule-event-item__opponent-name, .schedule-default-event__opponent-name');
                let opponent = oppEl ? oppEl.innerText.trim() : "";

                if (!opponent) {
                    const teamContent = card.querySelector('.schedule-event-item__team-content');
                    if (teamContent) {
                        const promo = teamContent.querySelector('.schedule-event-item__promo-title');
                        if (promo) promo.remove();
                        opponent = teamContent.innerText.trim();
                    }
                }

                // 3. Extract ISO Date and Time directly from <time datetime="...">
                let isoDate = "";
                let isoTime = "TBA";

                const timeTag = card.querySelector('time[datetime]');
                if (timeTag) {
                    const dt = timeTag.getAttribute('datetime'); // e.g., "2027-02-15T19:00:00.000-06:00"
                    if (dt && dt.includes('T')) {
                        const [datePart, rest] = dt.split('T');
                        isoDate = datePart;

                        // Check if time is specified (ignore midnight default 00:00:00)
                        const timePart = rest.substring(0, 5); // "19:00"
                        if (timePart && timePart !== "00:00") {
                            let [h, m] = timePart.split(':').map(Number);
                            const ampm = h >= 12 ? 'PM' : 'AM';
                            h = h % 12 || 12;
                            isoTime = `${h}:${String(m).padStart(2, '0')}${ampm} CST`;
                        }
                    }
                }

                // Fallback to text labels if datetime attribute is missing
                if (!isoDate) {
                    const dayEl = card.querySelector('.schedule-event-date__day, .schedule-event-date__month-day');
                    isoDate = dayEl ? dayEl.innerText.trim() : "";
                }

                if (isoTime === "TBA") {
                    const resultLabel = card.querySelector('.schedule-event-item-result');
                    if (resultLabel) {
                        const match = resultLabel.innerText.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)(?:\s+[A-Z]{2,4})?)/i);
                        if (match) isoTime = match[0].trim();
                    }
                }

                if (opponent && isoDate) {
                    results.push({ isoDate, opponent, isoTime });
                }
            });

            return results;
        });

        console.log(`📋 Found ${rawEvents.length} Auburn ${defaultSportName} home events.`);
        const seen = new Set();

        for (const ev of rawEvents) {
            let cleanDate = ev.isoDate;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
                cleanDate = parseAuburnDate(cleanDate);
            }

            if (cleanDate !== "TBA" && new Date(cleanDate) < today) continue;

            let oppClean = toTitleCase(cleanAuburnOpponent(ev.opponent));
            if (!oppClean || oppClean.toLowerCase() === 'preview meet') {
                oppClean = 'Preview Meet';
            }

            const fullTitle = `Auburn Tigers vs. ${oppClean}`;
            const dedupeKey = `${cleanDate}-${fullTitle}`;

            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);

            venueData.push({
                venue: 'Auburn - Neville Arena',
                title: fullTitle,
                date: cleanDate,
                time: ev.isoTime,
                type: sportType
            });

            console.log(`✅ Kept: ${fullTitle} on ${cleanDate} (${ev.isoTime}) [${sportType}]`);
        }

    } catch (e) {
        console.log(`❌ Auburn ${defaultSportName} failed: ${e.message}`);
    } finally {
        await page.close();
    }
    return venueData;
}

// Auburn wrappers
async function scrapeNAGym(browser) {
    return scrapeAuburnSport(browser, 'https://auburntigers.com/sports/gymnastics/schedule', 'Gymnastics', 'Gymnastics');
}

async function scrapeNAMB(browser) {
    return scrapeAuburnSport(browser, 'https://auburntigers.com/sports/mens-basketball/schedule', 'NCAA MB', "Men's Basketball");
}

async function scrapeNAWB(browser) {
    return scrapeAuburnSport(browser, 'https://auburntigers.com/sports/womens-basketball/schedule', 'NCAA WB', "Women's Basketball");
}

async function scrapeNAWVB(browser) {
    return scrapeAuburnSport(browser, 'https://auburntigers.com/sports/womens-volleyball/schedule', 'NCAA WVB', "Women's Volleyball");
}


// Format time to standard XX:XXPM/AM (e.g., 6:00PM, 8:30PM, 12:30PM) without spaces
function formatTimeBaylor(timeStr) {
    if (!timeStr || timeStr.toUpperCase() === 'TBA') {
        return 'TBA';
    }

    if (/\bNOON\b/.test(timeStr.toUpperCase())) {   // a whole word: "AFTERNOON" is not noon
        return '12:00PM';
    }

    // If there is a time range/slash (e.g., "5PM / 5:30 PM"), take the first time
    if (timeStr.includes('/')) {
        timeStr = timeStr.split('/')[0].trim();
    }

    // Clean periods, timezones, and extra whitespace
    let cleaned = timeStr.toUpperCase()
        .replace(/\./g, '')
        .replace(/ET|CT|PT|MT|EDT|CDT/g, '')
        .trim();

    const match = cleaned.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);

    if (match) {
        let hour = match[1];
        let minute = match[2] || '00';
        let ampm = match[3].toUpperCase();

        return `${hour}:${minute}${ampm}`;
    }

    return cleaned.replace(/\s+/g, '');
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
                                    time: formatTimeBaylor(rawTime),
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

    const rawData = results.flat();
    const allData = dedupeRows(rawData);
    if (rawData.length !== allData.length) console.log(`\n🧹 Removed ${rawData.length - allData.length} duplicate rows`);
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
