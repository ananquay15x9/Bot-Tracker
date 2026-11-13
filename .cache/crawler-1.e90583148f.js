const { chromium } = require('playwright');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

//========================================
// YEAR HELPERS (replaces the years that used to be typed into this file)
// Many of these pages show dates with no year ("Nov 14"). The year is now worked out from today's date, so
// nothing needs editing when the calendar turns over.
//
//   seasonYearFor(month, day)  for an Aug-Jul sports season or an events list. The season counts as started on
//                              the most recent July 1: Aug-Dec belong to that year, Jan-Jun to the next, and
//                              July to the nearest July ahead.
//   yearForText("Sat, Nov 14") the same, reading the month and day out of a piece of text.
//   THIS_YEAR / NEXT_YEAR_NUM  for calendar-year leagues (MLS, NWSL, PLL): this calendar year and the next.
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

    if (/\bNOON\b/.test(timeStr.toUpperCase())) {   // a whole word: "AFTERNOON (2:30-3:30 PM)" is not noon
        return '12:00PM';
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

// Expand date ranges into individual dates
function expandDateRange(dateStr, isGoHeels = false) {
    const monthMap = {
        'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4,
        'may': 5, 'jun': 6, 'jul': 7, 'aug': 8,
        'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
    };

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

    const pattern2 = dateStr.match(/([A-Z]+)\.?\s+(\d+)\s*-\s*([A-Z]+)\.?\s+(\d+)/i);
    if (pattern2) {
        const startMonthStr = pattern2[1].toLowerCase().substring(0, 3);
        const startDay = parseInt(pattern2[2]);
        const endMonthStr = pattern2[3].toLowerCase().substring(0, 3);
        const endDay = parseInt(pattern2[4]);

        const startMonth = monthMap[startMonthStr];
        const endMonth = monthMap[endMonthStr];

        // no year on the page: work it out from today (a range such as "Dec 30 - Jan 2" runs into the next year)
        const baseYear = seasonYearFor(startMonth, startDay);
        let startYear = isGoHeels ? getYearForMonth(startMonthStr) : baseYear;
        let endYear = isGoHeels ? getYearForMonth(endMonthStr) : (endMonth < startMonth ? baseYear + 1 : baseYear);

        const dates = [];

        if (startMonth === endMonth) {
            for (let day = startDay; day <= endDay; day++) {
                dates.push(`${startYear}-${String(startMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
            }
        } else {
            const daysInStartMonth = new Date(startYear, startMonth, 0).getDate();
            for (let day = startDay; day <= daysInStartMonth; day++) {
                dates.push(`${startYear}-${String(startMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
            }
            for (let day = 1; day <= endDay; day++) {
                dates.push(`${endYear}-${String(endMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
            }
        }
        return dates;
    }

    return [dateStr];
}

function formatGoHeelsDate(dateStr) {
    if (!dateStr || dateStr === 'TBA') return dateStr;

    dateStr = dateStr.replace(/\n/g, ' ').replace(/\([A-Za-z]+\)/g, '').replace(/\s+/g, ' ').trim();
    dateStr = dateStr.replace(/(\b[A-Za-z]{3}\s+\d+)\s+\1/g, '$1');
    dateStr = dateStr.replace(/,\s*$/, '').trim();

    const monthMap = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
    };

    if (dateStr.includes(' - ') || /\d+\s*-/.test(dateStr)) {
        return dateStr;
    }

    const match = dateStr.match(/([A-Za-z]+)\.?\s+(\d+)/);
    if (match) {
        const monthStr = match[1].toLowerCase().substring(0, 3);
        const month = monthMap[monthStr];
        const day = match[2].padStart(2, '0');
        const year = getYearForMonth(monthStr);

        if (month) {
            return `${year}-${month}-${day}`;
        }
    }

    return dateStr;
}

function normalizeData(rawDate, rawTitle) {
    const title = rawTitle.trim().replace(/\s+/g, ' ');
    let cleanedText = rawDate.replace(/\([A-Za-z]+\)|[A-Za-z]+, /g, '').trim();
    cleanedText = cleanedText.replace(/\s+/g, ' ');

    let datePart = cleanedText;
    let timePart = "TBA";

    if (cleanedText.toLowerCase().includes('pm') || cleanedText.toLowerCase().includes('am')) {
        const timeMatch = cleanedText.match(/(\d+(?::\d+)?\s*(?:pm|am|p\.m\.|a\.m\.))/i);
        if (timeMatch) {
            timePart = timeMatch[1].trim();
            timePart = timePart.replace(/p\.m\./i, 'PM').replace(/a\.m\./i, 'AM');
            timePart = timePart.replace(/\s*pm/i, ' PM').replace(/\s*am/i, ' AM');
            timePart = timePart.trim();

            datePart = cleanedText.substring(0, timeMatch.index).trim();
            if (datePart && !datePart.endsWith(',')) {
                datePart = datePart + ',';
            }
        }
    }

    return { title, date: datePart, time: timePart };
}

async function setupTranscendKiller(page) {
    await page.addInitScript(() => {
        const kill = () => {
            const host = document.querySelector('#transcend-consent-manager, .satisfi_btn, .satisfi_container, #satisfi_chat_container');
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
        if (u.includes('transcend-cdn.com/cm/') || u.includes('transcend.io') || (u.includes('/consent') && u.includes('transcend'))) {
            return route.abort();
        }
        return route.continue();
    });
}

//========================================
// CATEGORIZATION FUNCTIONS

function categorizeCapitalOne(title, description) {
    const titleLower = title.toLowerCase();
    const descLower = (description || "").toLowerCase();
    const fullText = (titleLower + " " + descLower);

    if (fullText.includes('wizards') || fullText.includes('nba')) return 'NBA';
    if (fullText.includes('capitals') || fullText.includes('nhl')) return 'NHL';

    const collegeTeams = ['georgetown', 'hoyas', 'creighton', 'villanova', 'marquette', 'providence', 'xavier', 'uconn'];
    const isCollegeGame = collegeTeams.some(team => titleLower.includes(team)) || fullText.includes("men's basketball");
    if (isCollegeGame) return 'NCAA MB';

    if (titleLower.includes('mystics') || titleLower.includes('wnba')) return 'WNBA';

    const musicKeywords = ['k-pop', 'jyp', 'tour', 'album', 'stadium', 'performance', 'hits', 'billboard', 'artist', 'live', 'music', 'singer', 'band', 'grammy', 'female group', 'celebrated', 'concert'];
    if (musicKeywords.some(kw => fullText.includes(kw))) return 'Concert';

    return 'Other';
}

function categorizeEnterprise(title, description) {
    const titleLower = title.toLowerCase();
    const fullText = (title + " " + (description || "")).toLowerCase();

    if (titleLower.includes('blues') || titleLower.includes('nhl')) return 'NHL';
    if (titleLower.includes('billikens') || titleLower.includes('slu') || titleLower.includes('ncaa') || titleLower.includes('basketball tournament') || titleLower.includes('missouri valley')) return 'NCAA MB';

    const familyKeywords = ['disney', 'pixar', 'children', 'family', 'mickey', 'frozen', 'marvel'];
    if (familyKeywords.some(kw => fullText.includes(kw))) return 'Other';

    const musicKeywords = ['tour', 'album', 'concert', 'live', 'band', 'orchestra', 'symphony', 'debut', 'grammy', 'special guest', 'performance', 'music', 'festival', 'performing', 'show', 'comedian', 'comedy'];
    if (musicKeywords.some(kw => fullText.includes(kw))) return 'Concert';

    return 'Other';
}

function categorizeGoHeels(title) {
    const titleLower = title.toLowerCase();
    if (titleLower.includes('unc vs') || titleLower.includes('tar heels') || titleLower.includes('acc tournament') || titleLower.includes('tournament') || titleLower.includes('scrimmage')) {
        return 'NCAA MB';
    }
    const musicKeywords = ['concert', 'live music', 'band', 'singer', 'artist'];
    if (musicKeywords.some(kw => titleLower.includes(kw))) return 'Concert';
    return 'Other';
}

function assignType(title, description) {
    const titleLower = title.toLowerCase();
    const fullText = (title + " " + description).toLowerCase();

    const nhlMarkers = ['nhl', 'wild', 'blues', 'capitals', 'blackhawks'];
    const isVersusMatch = titleLower.includes(' vs ') || titleLower.includes(' vs. ');

    if ((nhlMarkers.some(m => fullText.includes(m)) || isVersusMatch) && !fullText.includes('pwhl')) return 'NHL';
    if (fullText.includes('pwhl') || (fullText.includes('women') && fullText.includes('hockey'))) return 'PWHL';

    const musicMarkers = ['tour', 'album', 'grammy', 'live', 'artist', 'concert', 'special guest', 'debut'];
    if (musicMarkers.some(m => fullText.includes(m))) return 'Concert';

    return 'Other';
}

function categorizeKFC(title, description) {
    const titleLower = title.toLowerCase();
    const descLower = (description || "").toLowerCase();
    const fullText = (titleLower + " " + descLower);

    if (fullText.includes("men's basketball") || (titleLower.includes('louisville') && titleLower.includes('basketball') && !titleLower.includes('women'))) return 'NCAA MB';
    if (fullText.includes("women's basketball") || titleLower.includes("women's basketball")) return 'NCAA WB';
    if (fullText.includes("volleyball") || titleLower.includes('volleyball')) return 'NCAA WVB';

    const musicKeywords = ['tour', 'album', 'concert', 'live', 'artist', 'band', 'grammy', 'performing', 'music'];
    if (musicKeywords.some(kw => fullText.includes(kw))) return 'Concert';

    return 'Other';
}

function categorizeAmerant(title, description) {
    const titleLower = title.toLowerCase();
    const descLower = (description || "").toLowerCase();
    const fullText = (titleLower + " " + descLower);

    if (fullText.includes('mickey') || fullText.includes('disney') || fullText.includes('wwe')) return 'Other';
    if (titleLower.includes('panthers') || titleLower.includes('nhl') || titleLower.includes('hockey') || titleLower.includes('vs') || titleLower.includes('fla') || titleLower.includes('tor') || titleLower.includes('det') || titleLower.includes('cbj') || titleLower.includes('bos') || titleLower.includes('ott') || titleLower.includes('nyr')) return 'NHL';

    const musicKeywords = ['concert', 'band', 'orchestra', 'symphony', 'choir', 'live', 'performance', 'tour', 'festival', 'show', 'tribute'];
    if (musicKeywords.some(kw => fullText.includes(kw))) return 'Concert';

    return 'Other';
}

function parseCanadaLifeTime(timeStr) {
    if (!timeStr || timeStr.trim() === '' || timeStr.toUpperCase() === 'TBA') {
        return 'TBA';
    }

    const clean = timeStr.trim().toLowerCase();

    // Handles FullCalendar shorthand: "9a", "9p", "7:30p", "11:30a", "12p"
    const match = clean.match(/(\d{1,2})(?::(\d{2}))?\s*([ap])m?/i);
    if (match) {
        const hour = match[1];
        const min = match[2] || '00';
        const ampm = match[3].toLowerCase() === 'p' ? 'PM' : 'AM';
        return `${hour}:${min}${ampm}`;
    }

    return formatTime(timeStr);
}

function categorizeCanadaLife(title) {
    const t = (title || "").toLowerCase();

    if (t.includes('jets') || t.includes('nhl')) return 'NHL';
    if (t.includes('moose') || t.includes('ahl')) return 'AHL';
    if (t.includes('sea bears') || t.includes('cebl')) return 'CEBL';

    const musicKeywords = [
        'concert', 'tour', 'live', 'album', 'band', 'orchestra', 
        'symphony', 'music', 'festival', 'rock', 'grammy', 'acoustic'
    ];
    if (musicKeywords.some(kw => t.includes(kw)) && !t.includes('tournament')) {
        return 'Concert';
    }

    return 'Other';
}

function categorizeChartway(title) {
    const t = title.toUpperCase();
    if (t.includes("MEN'S BASKETBALL") || t.includes("ODU MBB")) return 'NCAA MB';
    if (t.includes("WOMEN'S BASKETBALL") || t.includes("ODU WBB")) return 'NCAA WB';
    if (t.includes("VOLLEYBALL")) return 'NCAA WVB';
    if (t.includes("WRESTLING")) return 'Wrestling';
    if (t.includes("CONCERT") || t.includes("LIVE IN CONCERT")) return 'Concert';
    return 'Other';
}

function categorizeFaurotField(opponent) {
    return 'NCAA Football';
}

function categorizeTQL(title, categoryText) {
    const titleLower = title.toLowerCase();
    const catLower = categoryText.toLowerCase();

    if (titleLower.includes('fc cincinnati 2') || titleLower.includes('next pro')) return 'MLS Next Pro';
    if (titleLower.includes('fc cincinnati') || catLower.includes('soccer')) return 'MLS';
    if (catLower.includes('concert') || titleLower.includes('tour')) return 'Concert';
    if (titleLower.includes('stadium tour')) return 'Other';
    return 'Other';
}

function categorizeVillanova(sportCode, opponent) {
    const text = (sportCode + " " + opponent).toUpperCase();
    if (text.includes('MBB')) return 'NCAA MB';
    if (text.includes('WBB')) return 'NCAA WB';
    if (text.includes('WVB') || text.includes('VOLLEYBALL')) return 'NCAA WVB';
    return null;
}

function categorizeSMG(text) {
    const t = text.toLowerCase();
    if (t.includes('concert') || t.includes('tour') || t.includes('live in') || t.includes('sonic temple')) return 'Concert';
    if (t.includes('mls next pro') || t.includes('crew 2')) return 'MLS Next Pro';
    if (t.includes('mls') || t.includes('columbus crew') || t.includes('uswnt')) return 'MLS';
    return 'Other';
}

// ======================================================================================
// VENUE SCRAPER FUNCTIONS

// Capital One Main Function
async function scrapeCapitalOne(browser) {
    const page = await browser.newPage();
    const venueData = [];
    try {
        await page.goto('https://www.capitalonearena.com/events', { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log(`\nScraping Capital One Arena...`);

        try { await page.getByRole('button', { name: 'Accept All' }).click({ timeout: 4000 }); } catch(e) {}

        while (await page.getByRole('button', { name: 'More Events' }).isVisible()) {
            await page.getByRole('button', { name: 'More Events' }).click();
            await page.waitForTimeout(1000);
        }

        const eventItems = await page.locator('.info.clearfix').all();
        const eventsToScrape = [];

        for (const item of eventItems) {
            const titleLocator = item.locator('h3.title a');
            const url = await titleLocator.getAttribute('href');
            const rawTitle = await titleLocator.innerText();
            const dateText = await item.locator('.date').innerText();

            eventsToScrape.push({
                url: url.startsWith('http') ? url : `https://www.capitalonearena.com${url}`,
                rawTitle,
                dateText
            });
        }

        console.log(`Collected ${eventsToScrape.length} Capital One event links. Deep scraping...`);

        for (const event of eventsToScrape) {
            try {
                await page.goto(event.url, { waitUntil: 'domcontentloaded', timeout: 20000 });

                let eventDescription = "";
                const descLocator = page.locator('.description_inner');
                if (await descLocator.count() > 0) {
                    eventDescription = await descLocator.textContent();
                }

                const cleanTitle = event.rawTitle.trim().replace(/\s+/g, ' ');
                const eventType = categorizeCapitalOne(cleanTitle, eventDescription);

                console.log(`Pulling: ${cleanTitle} as ${eventType}`);

                const { title, date, time } = normalizeData(event.dateText, cleanTitle);
                const formattedDate = formatDate(date);
                const dates = expandDateRange(formattedDate);

                for (const singleDate of dates) {
                    venueData.push({
                        venue: 'Capital One Arena',
                        title,
                        date: singleDate,
                        time: formatTime(time),
                        type: eventType
                    });
                }
            } catch (e) { console.log(`Capital One subpage failed: ${e.message.substring(0, 45)}`); }
        }
    } catch (e) { console.log(`Capital One Arena failed: ${e.message}`); }
    await page.close();
    return venueData;
}



// EC Main Function
async function scrapeEnterprise(browser) {
    const page = await browser.newPage();
    const venueData = [];
    try {
        await page.goto('https://www.enterprisecenter.com/events', { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log(`\nScraping Enterprise Center...`);

        await page.waitForSelector('#eventsList .event-entry', { timeout: 15000 });

        try {
            while (true) {
                const loadMoreVisible = await page.isVisible('#loadMoreEvents');
                if (!loadMoreVisible) break;

                const beforeCount = await page.locator('#eventsList .event-entry').count();
                await page.locator('#loadMoreEvents').scrollIntoViewIfNeeded();
                await page.locator('#loadMoreEvents').click();
                await page.waitForTimeout(1500);

                const afterCount = await page.locator('#eventsList .event-entry').count();
                if (afterCount <= beforeCount) break;
            }
        } catch (e) {}

        const infoLinks = await page.locator('#eventsList a.more').all();
        const urlsToVisit = [];

        for (const link of infoLinks) {
            const href = await link.getAttribute('href');
            if (href) {
                urlsToVisit.push(href.startsWith('http') ? href : `https://www.enterprisecenter.com${href}`);
            }
        }

        const uniqueUrls = [...new Set(urlsToVisit)];

        for (const detailUrl of uniqueUrls) {
            try {
                await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
                const eventTitle = await page.locator('h1').first().innerText();

                let eventDescription = "";
                const descLocator = page.locator('.collapse-wrapper');
                if (await descLocator.count() > 0) {
                    try {
                        const readMoreBtn = page.locator('span.readmore');
                        if (await readMoreBtn.isVisible()) {
                            await readMoreBtn.click();
                            await page.waitForTimeout(300);
                        }
                        eventDescription = await descLocator.textContent();
                    } catch (e) {}
                }

                const eventType = categorizeEnterprise(eventTitle, eventDescription);
                console.log(`Pulling: ${eventTitle.trim()} as ${eventType}`);

                const showtimes = await page.locator('.showings_list li.entry').all();
                for (const show of showtimes) {
                    const dateText = await show.locator('.date').innerText();
                    const timeText = await show.locator('.time').innerText();
                    const rawDateAndTime = `${dateText.trim()} ${timeText.trim()}`;

                    const { title, date, time } = normalizeData(rawDateAndTime, eventTitle.trim());
                    const formattedDate = formatDate(date);
                    const dates = expandDateRange(formattedDate);

                    for (const singleDate of dates) {
                        venueData.push({
                            venue: 'Enterprise Center',
                            title,
                            date: singleDate,
                            time: formatTime(time),
                            type: eventType
                        });
                    }
                }
            } catch (e) { console.log(`Error scraping Enterprise event detail: ${e.message.substring(0, 45)}`); }
        }
    } catch (e) { console.log(`Enterprise failed: ${e.message}`); }
    await page.close();
    return venueData;
}

// Dean Smith Center Main Function
async function scrapeGoHeels(browser) {
    const page = await browser.newPage();
    const venueData = [];
    // The selector below matches a game's inner header AND its outer card, so every game is seen twice.
    const seenGames = new Set();
    try {
        await page.goto('https://goheels.com/sports/mens-basketball/schedule', { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log(`\nScraping Go Heels (Dean Smith Center)...`);

        await page.evaluate(() => {
            const host = document.querySelector('#transcend-consent-manager');
            if (host) host.remove();
            document.documentElement.style.overflow = 'auto';
            document.body.style.overflow = 'auto';
            document.body.style.position = 'static';
        });

        try {
            await page.evaluate(async () => {
                await new Promise((resolve) => {
                    let totalHeight = 0;
                    let distance = 200;
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
        } catch (e) {}

        const gameCards = await page.locator('.s-game-card__header-inner-top-inner, .s-game-card').all();
        console.log(`Found ${gameCards.length} Go Heels games! Checking venue location...`);

        for (const card of gameCards) {
            try {
                const cardText = await card.innerText();
                const cardTextLower = cardText.toLowerCase();

                // Requirement 3: need to only scrape from 'Smith Center, Chapel Hill' only
                if (!cardTextLower.includes('smith center') && !cardTextLower.includes('chapel hill')) {
                    continue;
                }

                const opponent = await card.locator('[data-test-id="s-game-card-standard__header-team-opponent-link"]').innerText();

                let dateText = '';
                const upcomingDate = card.locator('[data-test-id="s-game-card-standard__header-game-date"]');
                const pastDate = card.locator('[data-test-id="s-game-card-standard__header-game-date-details"]');

                if (await upcomingDate.count() > 0) {
                    dateText = await upcomingDate.innerText();
                } else if (await pastDate.count() > 0) {
                    dateText = await pastDate.innerText();
                }

                const timeLoc = card.locator('[data-test-id="s-game-card-standard__header-game-time"]');
                const timeText = (await timeLoc.count() > 0) ? await timeLoc.innerText() : "TBA";

                const cleanTitle = `UNC vs ${opponent.trim()}`;
                const rawDateAndTime = `${dateText.trim()} ${timeText.trim()}`;
                
                let finalDate = rawDateAndTime;
                let finalTime = 'TBA';

                const timeMatch = rawDateAndTime.match(/(\d+(?::\d+)?\s*(?:p\.m\.|a\.m\.|PM|AM))/i);
                if (timeMatch) {
                    finalTime = timeMatch[1].trim().replace(/p\.m\./i, 'PM').replace(/a\.m\./i, 'AM').replace(/\s+/g, ' ').trim();
                    finalDate = rawDateAndTime.substring(0, timeMatch.index).trim();
                    if (finalDate && !finalDate.endsWith(',')) {
                        finalDate = finalDate + ',';
                    }
                }

                const eventType = categorizeGoHeels(cleanTitle);
                const formattedDate = formatGoHeelsDate(finalDate);
                const dates = expandDateRange(formattedDate, true);

                for (const singleDate of dates) {
                    const gameKey = `${cleanTitle}|${singleDate}|${formatTime(finalTime)}`;
                    if (seenGames.has(gameKey)) continue;
                    seenGames.add(gameKey);
                    venueData.push({
                        venue: 'UNC - Dean Smith Center',
                        title: cleanTitle,
                        date: singleDate,
                        time: formatTime(finalTime),
                        type: eventType
                    });
                }
                console.log(`✅ Kept Smith Center game: ${cleanTitle} on ${dates[0]}`);
            } catch (e) { console.log(`Error scraping game card: ${e.message.substring(0, 45)}`); }
        }
    } catch (e) { console.log(`Go Heels failed: ${e.message}`); }
    await page.close();
    return venueData;
}

// Grand Casino Arena Main Function
async function scrapeGrandCasino(browser) {
    const page = await browser.newPage();
    const venueData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        console.log(`\nScraping Grand Casino Arena...`);
        await page.goto('https://www.grandcasinoarena.com/events', { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Click "Load More" until the button is gone (that's the end of the list).
        // The button hides itself while loading and can be covered by popups, so:
        //  - click it with a DOM click (works even if something overlaps it)
        //  - wait up to 15s for new events after each click
        //  - only stop once the button has been gone for ~3s, or 3 clicks in a row add nothing
        const gcLinkSelector = 'h3.title a, .info h3 a';
        const gcButtonPresent = () => page.evaluate(() => {
            const btn = document.querySelector('#loadMoreEvents');
            if (!btn || btn.disabled) return false;
            const style = window.getComputedStyle(btn);
            return style.display !== 'none' && style.visibility !== 'hidden' && btn.offsetParent !== null;
        });
        let gcFailedClicks = 0;
        for (let i = 0; i < 150; i++) {
            let present = await gcButtonPresent().catch(() => false);
            for (let w = 0; !present && w < 6; w++) {
                await page.waitForTimeout(500);
                present = await gcButtonPresent().catch(() => false);
            }
            if (!present) {
                console.log('   ↪︎ Grand Casino: "Load More" is gone, reached the end of the list.');
                break;
            }

            const before = await page.locator(gcLinkSelector).count();
            const offset = await page.locator('#loadMoreEvents').getAttribute('data-offset').catch(() => '?');
            await page.locator('#loadMoreEvents').scrollIntoViewIfNeeded().catch(() => {});
            await page.evaluate(() => document.querySelector('#loadMoreEvents')?.click());

            try {
                await page.waitForFunction(
                    ([sel, n]) => document.querySelectorAll(sel).length > n,
                    [gcLinkSelector, before],
                    { timeout: 15000 }
                );
                gcFailedClicks = 0;
                console.log(`   ↪︎ Grand Casino Load More (offset ${offset}): ${before} -> ${await page.locator(gcLinkSelector).count()} links`);
            } catch {
                gcFailedClicks++;
                console.log(`   ↪︎ Grand Casino Load More added nothing (attempt ${gcFailedClicks}/3)`);
                if (gcFailedClicks >= 3) break;
            }
            await page.waitForTimeout(800);
        }

        const eventLinks = await page.locator('h3.title a, .info h3 a').all();
        const urlsToVisit = [];
        for (const link of eventLinks) {
            const href = await link.getAttribute('href');
            if (href) {
                urlsToVisit.push(href.startsWith('http') ? href : `https://www.grandcasinoarena.com${href}`);
            }
        }
        const uniqueUrls = [...new Set(urlsToVisit)];
        console.log(`Found ${uniqueUrls.length} Grand Casino Arena events. Visiting detail pages...`);

        const seen = new Set();
        // The list is always in date order, so a date that comes out earlier than the
        // previous event's date means the year rolled over (Dec -> Jan = next year).
        let prevDate = null;

        for (const detailUrl of uniqueUrls) {
            try {
                await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

                const titleLoc = page.locator('h1.title, h1').first();
                const title = (await titleLoc.count() > 0) ? await titleLoc.innerText() : "Event";

                let month = "";
                let day = "";
                let year = ""; // filled in below: the year shown on the page, else the previous event's, else worked out from today
                let eventTime = "TBA";

                // Read the date ONLY from the sidebar "Date" item. The first .m-date__* on the
                // page can be a different date (e.g. the on-sale date), which gave wrong dates
                // like 2026-11-09 for a January 2027 game.
                const dateItem = page.locator('.eventDetailList .sidebar_event_date').first();
                const dateScope = (await dateItem.count() > 0) ? dateItem : page;
                const monthEl = dateScope.locator('.m-date__month').first();
                const dayEl = dateScope.locator('.m-date__day').first();
                const yearEl = dateScope.locator('.m-date__year').first();
                let yearShown = false;

                if (await monthEl.count() > 0) month = await monthEl.innerText();
                if (await dayEl.count() > 0) day = await dayEl.innerText();
                if (await yearEl.count() > 0) {
                    const yText = await yearEl.innerText();
                    const y = yText.replace(',', '').trim();
                    if (/^\d{4}$/.test(y)) { year = y; yearShown = true; }
                }
                if (!yearShown && prevDate) year = prevDate.slice(0, 4);

                const startsEl = page.locator('.sidebar_event_starts span').first();
                if (await startsEl.count() > 0) {
                    eventTime = await startsEl.innerText();
                }

                // Build the date directly. (The shared formatDate() ignores a year written as
                // "Jan 2, 2027" because of the comma, and falls back to 2026.)
                const gcMonths = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
                                   jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
                const gcMonth = gcMonths[month.trim().toLowerCase().slice(0, 3)];
                const gcDay = (day.match(/\d{1,2}/) || [''])[0];
                if (!year && gcMonth && gcDay) year = String(seasonYearFor(parseInt(gcMonth, 10), parseInt(gcDay, 10)));
                let cleanDate = (gcMonth && gcDay) ? `${year}-${gcMonth}-${gcDay.padStart(2, '0')}` : 'TBA';
                const cleanTime = formatTime(eventTime);

                // Keep the list's order: if this date is before the previous event's, it's next year
                if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate) && prevDate && cleanDate < prevDate) {
                    let y = parseInt(cleanDate.slice(0, 4), 10);
                    let fixed = cleanDate;
                    while (fixed < prevDate && y < parseInt(prevDate.slice(0, 4), 10) + 2) {
                        y++;
                        fixed = `${y}${cleanDate.slice(4)}`;
                    }
                    console.log(`   ↪︎ Grand Casino: ${title.replace(/\s+/g, ' ').trim()} read as ${cleanDate}, out of list order -> ${fixed}`);
                    cleanDate = fixed;
                }
                if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) prevDate = cleanDate;

                if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
                    const [cy, cm, cd] = cleanDate.split('-').map(Number);
                    if (new Date(cy, cm - 1, cd) < today) continue;
                }

                let eventType = 'Concert';
                const t = title.toLowerCase();
                if (t.includes('wild') || t.includes('nhl') || t.includes('vs')) eventType = 'NHL';
                else if (t.includes('pwhl')) eventType = 'PWHL';

                const cleanTitle = title.replace(/\s+/g, ' ').trim();
                const dedupeKey = `${cleanDate}-${cleanTitle}`;

                if (seen.has(dedupeKey)) continue;
                seen.add(dedupeKey);

                venueData.push({
                    venue: 'Grand Casino Arena',
                    title: cleanTitle,
                    date: cleanDate,
                    time: cleanTime,
                    type: eventType
                });

                console.log(`✅ Kept: ${cleanTitle} on ${cleanDate} (${cleanTime}) [${eventType}]`);
            } catch (err) {
                console.log(`Grand Casino subpage failed: ${err.message.substring(0, 45)}`);
            }
        }

    } catch (e) {
        console.log(`Grand Casino Arena failed: ${e.message}`);
    } finally {
        await page.close();
    }
    return venueData;
}

// KFC Yum Center Main Function
async function scrapeKFC(browser) {
    const page = await browser.newPage();
    const venueData = [];
    try {
        await page.goto('https://www.kfcyumcenter.com/events', { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log(`\nScraping KFC Yum Center...`);

        try {
            const loadMoreBtn = page.locator('#loadMoreEvents');
            while (await loadMoreBtn.isVisible()) {
                await loadMoreBtn.scrollIntoViewIfNeeded();
                await loadMoreBtn.click();
                await page.waitForTimeout(1500);
            }
        } catch (e) {}

        const eventLinks = await page.locator('h3.title a').all();
        const urlsToVisit = [];

        for (const link of eventLinks) {
            const href = await link.getAttribute('href');
            if (href) urlsToVisit.push(href.startsWith('http') ? href : `https://www.kfcyumcenter.com${href}`);
        }
        const uniqueUrls = [...new Set(urlsToVisit)].filter(url => url.includes('/events/detail/'));
        console.log(`Found ${uniqueUrls.length} unique KFC events. Scraping...`);

        for (const detailUrl of uniqueUrls) {
            try {
                await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

                const titleLoc = page.locator('h1.title, h1').first();
                const eventTitle = (await titleLoc.count() > 0) ? await titleLoc.innerText() : "Event";

                try {
                    const moreInfoBtn = page.locator('button.read-more');
                    if (await moreInfoBtn.isVisible()) {
                        await moreInfoBtn.click();
                        await page.waitForTimeout(300);
                    }
                } catch (e) {}

                const descLoc = page.locator('.description_inner');
                const eventDescription = (await descLoc.count() > 0) ? await descLoc.textContent() : "";
                const eventType = categorizeKFC(eventTitle, eventDescription);

                const showtimeItems = await page.locator('ul.list li.listItem, .showings_list li').all();

                if (showtimeItems.length === 0) {
                    const fallbackDateLoc = page.locator('.showings_date, .m-date');
                    if (await fallbackDateLoc.count() > 0) {
                        const rawText = await fallbackDateLoc.innerText();
                        const { title, date, time } = normalizeData(rawText, eventTitle);
                        venueData.push({
                            venue: 'Louisville - KFC Yum! Center',
                            title: title,
                            date: formatDate(date),
                            time: formatTime(time),
                            type: eventType
                        });
                    }
                    continue;
                }

                for (const show of showtimeItems) {
                    const mLoc = show.locator('.m-date__month');
                    const dLoc = show.locator('.m-date__day');
                    const tLoc = show.locator('.time.cell, .time');

                    const month = (await mLoc.count() > 0) ? await mLoc.innerText() : "";
                    const day = (await dLoc.count() > 0) ? await dLoc.innerText() : "";
                    const time = (await tLoc.count() > 0) ? await tLoc.innerText() : "TBA";

                    const rawDateString = (month && day) ? `${month.trim()} ${day.trim()}, ${yearForText(`${month} ${day}`)}` : await show.innerText();
                    const { title, date, time: cleanTime } = normalizeData(`${rawDateString} ${time}`, eventTitle);
                    const formattedDate = formatDate(date);

                    venueData.push({
                        venue: 'KFC Yum! Center',
                        title: title,
                        date: formattedDate,
                        time: formatTime(cleanTime),
                        type: eventType
                    });
                }
                console.log(`Pulling: ${eventTitle} [${eventType}]`);
            } catch (e) { console.log(`Error scraping KFC detail: ${e.message.substring(0, 45)}`); }
        }
    } catch (e) { console.log(`KFC failed: ${e.message}`); }
    await page.close();
    return venueData;
}

// Amerant Bank Arena Main Function
async function scrapeAmerant(browser) {
    const page = await browser.newPage();
    const venueData = [];
    try {
        await page.goto('https://www.amerantbankarena.com/events', { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log(`\nScraping Amerant Bank Arena...`);

        try {
            const loadMoreBtn = page.locator('#loadMoreEvents');
            while (await loadMoreBtn.isVisible() && !(await loadMoreBtn.getAttribute('disabled'))) {
                await loadMoreBtn.scrollIntoViewIfNeeded();
                await loadMoreBtn.click();
                await page.waitForTimeout(1500);
            }
        } catch (e) {}

        const eventLinks = await page.locator('h3.title a').all();
        const urlsToVisit = [];
        for (const link of eventLinks) {
            const href = await link.getAttribute('href');
            if (href) urlsToVisit.push(href.startsWith('http') ? href : `https://www.amerantbankarena.com${href}`);
        }

        const uniqueUrls = [...new Set(urlsToVisit)].filter(url => url.includes('/events/detail/'));
        console.log(`Found ${uniqueUrls.length} Amerant events. Scraping...`);

        for (const detailUrl of uniqueUrls) {
            try {
                await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
                const titleLoc = page.locator('h1.title, h1').first();
                const eventTitle = (await titleLoc.count() > 0) ? await titleLoc.innerText() : "Event";

                try {
                    const moreInfoBtn = page.locator('button.read-more');
                    if (await moreInfoBtn.isVisible()) {
                        await moreInfoBtn.click();
                        await page.waitForTimeout(300);
                    }
                } catch (e) {}

                const descLoc = page.locator('.description_inner');
                const eventDescription = (await descLoc.count() > 0) ? await descLoc.textContent() : "";
                const eventType = categorizeAmerant(eventTitle, eventDescription);

                const showtimeItems = await page.locator('ul.list li.listItem, .showings_list li').all();

                for (const show of showtimeItems) {
                    const mLoc = show.locator('.m-date__month');
                    const dLoc = show.locator('.m-date__day');
                    const tLoc = show.locator('.time.cell, .time');

                    const month = (await mLoc.count() > 0) ? await mLoc.innerText() : "";
                    const day = (await dLoc.count() > 0) ? await dLoc.innerText() : "";
                    const time = (await tLoc.count() > 0) ? await tLoc.innerText() : "TBA";

                    const rawDateString = (month && day) ? `${month.trim()} ${day.trim()}, ${yearForText(`${month} ${day}`)}` : await show.innerText();
                    const { title, date, time: cleanTime } = normalizeData(`${rawDateString} ${time}`, eventTitle);
                    const formattedDate = formatDate(date);

                    venueData.push({
                        venue: 'Amerant Bank Arena',
                        title: title,
                        date: formattedDate,
                        time: formatTime(cleanTime),
                        type: eventType
                    });
                }
                console.log(`Pulling ${eventTitle} as ${eventType}`);
            } catch (e) { console.log(`Error scraping Amerant detail: ${e.message.substring(0, 45)}`); }
        }
    } catch (e) { console.log(`Amerant failed: ${e.message}`); }
    await page.close();
    return venueData;
}


// Canada Life Centre Main Function
// The calendar is an older FullCalendar month grid: day cells are a table, and the
// events are drawn ON TOP of it with absolute positions, so an event isn't inside its
// day cell in the HTML. Each event is matched to a day by where it sits on screen
// (its left edge and middle fall inside that day's cell).
// "9a" / "7:30p" in .fc-event-time is the start time (local Winnipeg time, no conversion).
function extractCanadaLifeMonth() {
    const clean = s => (s || '').replace(/\s+/g, ' ').trim();
    const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];

    // Month/year shown in the header, e.g. "November 2026"
    const header = clean(document.querySelector('.fc-header-title h2, .fc-toolbar-title, .fc-header-title')?.textContent);
    const hm = header.match(/([A-Za-z]+)\s+(\d{4})/);
    const viewMonth = hm ? monthNames.indexOf(hm[1].toLowerCase()) : -1;   // 0-11
    const viewYear = hm ? parseInt(hm[2], 10) : NaN;

    // ---- Day cells, in grid order
    const tds = Array.from(document.querySelectorAll('td.fc-day'));
    const firstInMonth = tds.findIndex(td => !td.classList.contains('fc-other-month'));
    const cells = tds.map((td, i) => {
        let date = td.getAttribute('data-date') || '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) && viewMonth >= 0) {
            const dayNum = parseInt(clean(td.querySelector('.fc-day-number')?.textContent), 10);
            if (dayNum) {
                let y = viewYear, m = viewMonth;
                if (td.classList.contains('fc-other-month')) {
                    if (i < firstInMonth) { m -= 1; } else { m += 1; }
                    if (m < 0) { m = 11; y -= 1; }
                    if (m > 11) { m = 0; y += 1; }
                }
                date = `${y}-${String(m + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            }
        }
        return { rect: td.getBoundingClientRect(), date };
    });

    // ---- Events: match each to the cell under its left edge / vertical middle
    const events = [];
    document.querySelectorAll('a.fc-event, div.fc-event').forEach(ev => {
        // A multi-week event is drawn as several pieces; only the first piece marks the start day
        if (ev.classList.contains('fc-event-hori') && !ev.classList.contains('fc-event-start')) return;

        const r = ev.getBoundingClientRect();
        if (!r.width && !r.height) return;
        const x = r.left + 3;
        const y = r.top + Math.min(r.height / 2, 20);

        let cell = cells.find(c => x >= c.rect.left && x < c.rect.right && y >= c.rect.top && y < c.rect.bottom);
        if (!cell) {
            // Fallback: same column, closest row
            const sameCol = cells.filter(c => x >= c.rect.left && x < c.rect.right);
            sameCol.sort((a, b) => Math.abs(a.rect.top - y) - Math.abs(b.rect.top - y));
            cell = sameCol[0];
        }

        events.push({
            title: clean(ev.querySelector('.fc-event-title')?.textContent || ev.getAttribute('title') || ev.textContent),
            rawTime: clean(ev.querySelector('.fc-event-time')?.textContent),
            date: cell ? cell.date : '',
            href: ev.getAttribute('href') || ''
        });
    });

    return { header, cellCount: cells.length, events };
}

async function scrapeCanadaLifeCentre(browser) {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 900 }
    });
    const page = await context.newPage();
    const venueData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const seenEvents = new Set();

    try {
        console.log(`\n🍁 Navigating to Canada Life Centre Calendar...`);
        await page.goto('https://www.canadalifecentre.ca/calendar/', {
            waitUntil: 'domcontentloaded',
            timeout: 45000
        });

        try {
            const cookieBtn = page.locator('#onetrust-accept-btn-handler, button:has-text("Accept")').first();
            if (await cookieBtn.isVisible({ timeout: 4000 })) await cookieBtn.click();
        } catch (e) {}

        try {
            await page.waitForSelector('td.fc-day', { state: 'attached', timeout: 30000 });
        } catch (e) {
            await page.screenshot({ path: 'canadalife_debug.png', fullPage: true }).catch(() => {});
            console.log(`   ⚠️ Calendar grid never appeared (page title: "${await page.title()}"). Saved canadalife_debug.png`);
            throw e;
        }

        for (let m = 0; m < 12; m++) {
            // Events are loaded after the grid; give them time to draw
            await page.waitForSelector('a.fc-event, div.fc-event', { state: 'attached', timeout: 15000 }).catch(() => {});
            await page.waitForTimeout(1500);

            const month = await page.evaluate(extractCanadaLifeMonth);
            console.log(`📅 Canada Life Centre ${month.header || `month ${m + 1}`}: ${month.events.length} events on the grid`);

            for (const item of month.events) {
                if (!item.title) continue;
                if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
                    console.log(`   ⚠️ No day found for "${item.title}"`);
                    continue;
                }

                const [y, mo, d] = item.date.split('-').map(Number);
                if (new Date(y, mo - 1, d) < today) continue;

                const cleanTitle = item.title.replace(/\s+/g, ' ').trim();
                const cleanTime = parseCanadaLifeTime(item.rawTime);   // "9a" -> "9:00AM"
                const eventType = categorizeCanadaLife(cleanTitle);

                // Days from the next/previous month show up in two views; skip repeats
                const dedupeKey = `${item.date}-${cleanTime}-${cleanTitle.toLowerCase()}`;
                if (seenEvents.has(dedupeKey)) continue;
                seenEvents.add(dedupeKey);

                venueData.push({
                    venue: 'Canada Life Centre',
                    title: cleanTitle,
                    date: item.date,
                    time: cleanTime,
                    type: eventType
                });
                console.log(`✅ Kept: ${cleanTitle} on ${item.date} (${cleanTime}) [${eventType}]`);
            }

            // Next month: wait until the header actually changes
            const nextBtn = page.locator('.fc-button-next, button.fc-next-button, span.fc-button-next').first();
            if (!(await nextBtn.isVisible({ timeout: 3000 }).catch(() => false))) break;
            const before = month.header;
            await nextBtn.click();
            await page.waitForFunction(
                prev => {
                    const el = document.querySelector('.fc-header-title h2, .fc-toolbar-title, .fc-header-title');
                    return el && el.textContent.replace(/\s+/g, ' ').trim() !== prev;
                },
                before,
                { timeout: 10000 }
            ).catch(() => {});
        }

        console.log(`🏁 Finished Canada Life Centre: ${venueData.length} upcoming events extracted.`);

    } catch (e) {
        console.log(`❌ Canada Life Centre failed: ${e.message}`);
    } finally {
        await page.close();
        await context.close();
    }

    return venueData;
}

// Chartway Arena scraper

async function scrapeChartway(browser) {
    const page = await browser.newPage();
    const venueData = [];
    try {
        await page.goto('https://www.chartwayarena.com/events', { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log(`\nScraping Chartway Arena...`);

        try {
            const cookieBtn = page.getByRole('button', { name: 'Accept All Cookies' });
            if (await cookieBtn.isVisible({ timeout: 5000 })) {
                await cookieBtn.click();
                await page.waitForTimeout(1000);
            }
        } catch (e) {}

        const moreBtn = page.locator('#loadMoreEvents');
        while (await moreBtn.isVisible()) {
            await moreBtn.click();
            await page.waitForTimeout(1000);
        }

        const urls = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.eventItem .thumb a')).map(a => a.href);
        });

        console.log(`Found ${urls.length} Chartway events. Starting parsing...`);
        const today = new Date().toISOString().split('T')[0];

        for (const url of urls) {
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

                const titleLoc = page.locator('h1.title, h1').first();
                if (await titleLoc.count() === 0) continue;
                const title = await titleLoc.innerText();

                let cleanDate = "TBA";
                let eventTime = "TBA";

                const showingsDateLoc = page.locator('.showings_date').first();
                if (await showingsDateLoc.count() > 0) {
                    const ariaLabel = await showingsDateLoc.getAttribute('aria-label') || "";
                    const yearMatch = ariaLabel.match(/\d{4}/);
                    const dynamicYear = yearMatch ? yearMatch[0] : '';

                    const monthLoc = showingsDateLoc.locator('.m-date__month').first();
                    const dayLoc = showingsDateLoc.locator('.m-date__day').first();
                    const month = (await monthLoc.count() > 0) ? await monthLoc.innerText() : "";
                    const day = (await dayLoc.count() > 0) ? await dayLoc.innerText() : "";

                    if (month && day) cleanDate = formatDate(`${month} ${day} ${dynamicYear || yearForText(`${month} ${day}`)}`);

                    const hourLoc = showingsDateLoc.locator('.m-date__hour').first();
                    if (await hourLoc.count() > 0) {
                        const rawHour = await hourLoc.innerText();
                        eventTime = rawHour.replace('@', '').trim();
                    }
                }

                if (cleanDate !== "TBA" && cleanDate < today) continue;

                const descLoc = page.locator('.description_inner').first();
                const description = (await descLoc.count() > 0) ? await descLoc.innerText() : "";

                venueData.push({
                    venue: 'Old Dominion - Chartway Arena',
                    title: title.trim(),
                    date: cleanDate,
                    time: formatTime(eventTime),
                    type: categorizeChartway(title + " " + description)
                });

                console.log(`Pulling ${title.trim()} [${cleanDate}]`);
            } catch (err) { console.log(`Failed on ${url}: ${err.message.substring(0, 45)}`); }
        }
    } catch (e) { console.log(`Chartway failed: ${e.message}`); }
    await page.close();
    return venueData;
}

// Reads a kickoff time out of the text of a schedule card's time label. Returns "7:30PM", "TBA", or "" when the text is not a time.
//   "6:30 PM CST" -> 6:30PM    "TBA" / "Time TBD" -> TBA    "Noon" -> 12:00PM
//   "AFTERNOON (2:30-3:30 PM)" -> 2:30PM   (a TV window: the game starts at the beginning of it)
function parseKickoff(text) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    if (/\bTB[AD]\b/i.test(s)) return 'TBA';
    const range = s.match(/(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?m?\.?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?/i);
    if (range) {
        const sh = parseInt(range[1], 10), eh = parseInt(range[4], 10);
        let ap = (range[3] || '').toUpperCase() || (range[6] || '').toUpperCase();
        if (!range[3] && range[6].toUpperCase() === 'P' && sh === 11 && eh === 12) ap = 'A';   // "11:00-12:00 PM" starts in the morning
        return `${sh}:${range[2] || '00'}${ap}M`;
    }
    const one = s.match(/(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\b/i);
    if (one) return `${parseInt(one[1], 10)}:${one[2] || '00'}${one[3].toUpperCase()}M`;
    if (/\bnoon\b/i.test(s)) return '12:00PM';
    return '';
}

// Fallback for when a game card's own elements aren't recognised: reads the date, time and opponent out of the
// card's plain text instead (the text looks like "Home / vs. / FootballKentucky / Memorial StadiumColumbia, Mo.").
function parseFaurotCardText(raw) {
    const lines = String(raw || '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const text = lines.join(' ');
    const dm = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})\b/i);
    const tm = text.match(/\b(\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?)/i) || text.match(/\b(TBA|TBD)\b/i);
    let opponent = '';
    const k = lines.findIndex((l) => /^(vs\.?|at|@)$/i.test(l));
    if (k >= 0) {
        opponent = lines[k + 1] || '';
        if (/^football$/i.test(opponent)) opponent = lines[k + 2] || '';
    } else {
        const m = lines.map((l) => l.match(/^(?:vs\.?|at|@)\s+(.+)$/i)).find(Boolean);
        if (m) opponent = m[1];
    }
    opponent = opponent.replace(/^football\s*/i, '').replace(/^(?:no\.\s*)?\d{1,2}\s+(?=[A-Za-z])/i, '').trim();
    return { date: dm ? `${dm[1]} ${dm[2]}` : '', time: tm ? (/^tb[ad]$/i.test(tm[1]) ? 'TBA' : tm[1]) : '', opponent };
}

async function scrapeFaurotField(browser) {
    const page = await browser.newPage();
    const venueData = [];
    const seen = new Set();
    const skipped = { notHome: 0, noOpponent: 0, past: 0 };
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        console.log(`\n🚀 Scraping Faurot Field (Mizzou Football)...`);
        await setupTranscendKiller(page);

        // The site has two address styles for a season's schedule; use whichever one shows game cards.
        const season = currentSeasonStart();
        const urls = [
            `https://mutigers.com/sports/football/schedule/${season}`,
            `https://mutigers.com/sports/football/schedule/season/${season}`
        ];
        const cardSelector = '.schedule-event-item__top, .schedule-event-item';
        let gameCards = [];
        for (const url of urls) {
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForSelector(cardSelector, { timeout: 15000 });
                gameCards = await page.locator(cardSelector).all();
                if (gameCards.length > 0) { console.log(`🌐 Using ${url}`); break; }
            } catch (e) { console.log(`   (no game cards found at ${url}: ${e.message.split('\n')[0].substring(0, 80)})`); }
        }
        console.log(`📋 Found ${gameCards.length} game cards. Filtering for Faurot Field home games...`);

        let shown = 0;
        for (const card of gameCards) {
            try {
                const cardRaw = await card.innerText().catch(() => '');
                if (shown < 3) { shown++; console.log(`   🔬 card text: ${cardRaw.replace(/\s*\n\s*/g, ' | ').substring(0, 220)}`); }
                const cardText = cardRaw.toUpperCase();

                const venueTypeLoc = card.locator('.schedule-event-date__venue-label').first();
                const venueNameLoc = card.locator('.schedule-event-item__venue, .schedule-default-event__venue').first();
                const locationLoc = card.locator('.schedule-event-item__location, .schedule-event-location').first();

                const venueType = (await venueTypeLoc.count() > 0) ? await venueTypeLoc.innerText() : "";
                const venueName = (await venueNameLoc.count() > 0) ? await venueNameLoc.innerText() : "";
                const locationText = (await locationLoc.count() > 0) ? await locationLoc.innerText() : "";
                const fullLocation = `${venueType} ${venueName} ${locationText}`.toUpperCase();

                // The venue text can sit in an element this list doesn't know about (it reads "Memorial StadiumColumbia, Mo."
                // with no space), so the whole card's text is checked as well.
                const faurotText = /MEMORIAL\s*STADIUM|FAUROT/;
                const isHomeGame = fullLocation.includes('HOME') ||
                                   faurotText.test(fullLocation) ||
                                   /COLUMBIA,?\s*MO/.test(fullLocation) ||   // "Columbia, Mo." - but not Columbia, S.C. (an away game)
                                   faurotText.test(cardText);
                console.log(`   · "${venueType.trim()}" | "${venueName.trim()}" | "${locationText.trim()}" -> ${isHomeGame ? 'Faurot Field home game' : 'not a Faurot Field home game, skipped'}`);
                if (!isHomeGame) { skipped.notHome++; continue; }

                const fromText = parseFaurotCardText(cardRaw);

                const opponentLoc = card.locator('.schedule-default-event__opponent-name').first();
                let opponent = "";
                if (await opponentLoc.count() > 0) {
                    opponent = await opponentLoc.innerText();
                } else {
                    const fallbackNameLoc = card.locator('.schedule-default-event__name').first();
                    if (await fallbackNameLoc.count() > 0) opponent = await fallbackNameLoc.innerText();
                }
                if (!opponent.trim()) opponent = fromText.opponent;
                if (!opponent.trim()) { skipped.noOpponent++; console.log('   ⚠️ home game, but no opponent name was found on the card - skipped'); continue; }

                const dateLoc = card.locator('.schedule-event-date__month-day').first();
                let rawDate = (await dateLoc.count() > 0) ? await dateLoc.innerText() : "";
                if (!rawDate.trim()) rawDate = fromText.date;

                // The kickoff time is in .schedule-event-item-result__label. If that label is there, it is the answer:
                // "TBA" stays TBA (nothing else on the card is allowed to override it), and a window such as
                // "AFTERNOON (2:30-3:30 PM)" gives its start. The rest of the card is only searched when there is no label at all.
                let rawTime = "";
                const labelLoc = card.locator('.schedule-event-item-result__label');
                const labelText = (await labelLoc.count() > 0) ? (await labelLoc.first().innerText()).trim() : "";
                if (labelText) {
                    rawTime = parseKickoff(labelText) || "TBA";
                } else {
                    const dtLoc = card.locator('.schedule-event-date__time');
                    const n = await dtLoc.count();
                    for (let i = 0; i < n && !rawTime; i++) rawTime = parseKickoff((await dtLoc.nth(i).innerText()).trim());
                    if (!rawTime) rawTime = parseKickoff(fromText.time) || "TBA";
                }
                console.log(`   ⏰ time label: "${labelText}" -> ${rawTime}`);

                const cleanDate = formatDate(`${rawDate} ${yearForText(rawDate)}`);
                const cleanTime = formatTime(rawTime);

                const eventDate = new Date(cleanDate);
                if (cleanDate !== 'TBA' && eventDate < today) {
                    skipped.past++;
                    continue;
                }

                // Keep the site's own capitalisation ("Kentucky", "Texas A&M"); only repair an all-caps name.
                let oppName = opponent.replace(/\s+/g, ' ').trim();
                if (oppName === oppName.toUpperCase()) oppName = oppName.replace(/[A-Za-z']{4,}/g, (w) => w[0] + w.slice(1).toLowerCase());
                const finalTitle = `Missouri vs ${oppName}`;
                const key = `${finalTitle}|${cleanDate}|${cleanTime}`;
                if (seen.has(key)) continue;   // the card selector can match a game's inner and outer element
                seen.add(key);

                venueData.push({
                    venue: 'Mizzou: Faurot Field',
                    title: finalTitle,
                    date: cleanDate,
                    time: cleanTime,
                    type: 'NCAA Football'
                });

                console.log(`✅ Kept: ${finalTitle} on ${cleanDate} at ${cleanTime}`);
            } catch (err) { console.log(`Error processing Faurot card: ${err.message.substring(0, 45)}`); }
        }
        console.log(`📊 Faurot Field: ${gameCards.length} cards read - kept ${venueData.length}, skipped ${skipped.notHome} not home games, ${skipped.noOpponent} without an opponent name, ${skipped.past} already played`);
    } catch (e) { console.log(`❌ Faurot Field failed: ${e.message}`); console.log(`   page it was on: ${page.url()}`); }
    await page.close();
    return venueData;
}

async function scrapeTQL(browser) {
    const page = await browser.newPage();
    const today = new Date().toISOString().split('T')[0];
    const venueData = [];
    try {
        await setupTranscendKiller(page);
        await page.goto('https://tqlstadium.com/events', { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log(`\nScraping TQL...`);

        const eventItems = await page.locator('.eventlist-column-info').all();
        console.log(`Found ${eventItems.length} events at TQL Stadium.`);

        for (const item of eventItems) {
            try {
                const title = await item.locator('.eventlist-title-link').innerText();
                const categoryText = await item.locator('.eventlist-cats').innerText();
                const rawDate = await item.locator('time.event-date').getAttribute('datetime');

                if (rawDate < today) continue;

                const rawTime = await item.locator('.event-time-localized-start').innerText();
                const eventType = categorizeTQL(title, categoryText);

                venueData.push({
                    venue: 'TQL Stadium',
                    title: title.trim(),
                    date: rawDate,
                    time: formatTime(rawTime.trim()),
                    type: eventType
                });
                console.log(`Pulling ${title.trim()} [${eventType}]`);
            } catch (err) { continue; }
        }
    } catch (e) { console.log(`TQL failed: ${e.message}`); }
    await page.close();
    return venueData;
}

async function scrapeVillanova(browser) {
    const page = await browser.newPage();
    const today = new Date().toISOString().split('T')[0];
    const venueData = [];
    try {
        await setupTranscendKiller(page);
        await page.goto('https://villanova.com/calendar', { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log(`\nScraping Villanova...`);

        const monthsToScrape = 12;

        for (let i = 0; i < monthsToScrape; i++) {
            const header = page.locator('span[data-bind*="formatDate: selectedDate"]').first();
            await header.waitFor({ state: 'visible', timeout: 15000 });
            const monthYearText = await header.innerText();

            console.log(`Scraping Villanova: ${monthYearText}`);

            const expandButtons = await page.locator('button.sidearm-calendar-table-cell-toggle-button').all();
            for (const btn of expandButtons) {
                try {
                    if (await btn.isVisible()) await btn.click();
                } catch (e) { continue; }
            }
            await page.waitForTimeout(500);

            const dayCells = await page.locator('.sidearm-calendar-table-cell').all();
            for (const cell of dayCells) {
                const dayNumLoc = cell.locator('time[data-bind*="format: \'D\'"]');
                if (await dayNumLoc.count() === 0) continue;

                const dayNum = await dayNumLoc.innerText();
                const cleanDate = formatDate(`${monthYearText.split(' ')[0]} ${dayNum} ${monthYearText.split(' ')[1]}`);
                if (cleanDate < today) continue;

                const events = await cell.locator('ul.sidearm-calendar-table-cell-events li.sidearm-calendar-table-cell-event').all();

                for (const event of events) {
                    try {
                        const eventText = await event.innerText();
                        // Requirement: scrape only villanova, Pa. (exclude Philadelphia, Pa. or others)
                        const locLower = eventText.toLowerCase();
                        if (!locLower.includes('villanova, pa')) {
                            continue;
                        }

                        const sportCode = await event.locator('span[data-bind*="sport.short_display"]').innerText();
                        const opponent = await event.locator('span[data-bind*="opponent.title"]').innerText();
                        const eventType = categorizeVillanova(sportCode, opponent);

                        if (!eventType) continue;

                        let finalTime = "TBA";
                        const timeMatch = eventText.match(/(\d{1,2}(:\d{2})?\s*(?:p\.m\.|a\.m\.|AM|PM))/i);
                        if (timeMatch) finalTime = timeMatch[1];

                        venueData.push({
                            venue: 'Villanova - Finneran Pavilion',
                            title: `${sportCode} vs ${opponent}`,
                            date: cleanDate,
                            time: formatTime(finalTime),
                            type: eventType
                        });
                    } catch (err) { continue; }
                }
            }

            await page.locator('button.slick-next').first().click();
            await page.waitForFunction(
                (old, sel) => document.querySelector(sel)?.innerText !== old,
                monthYearText,
                'span[data-bind*="formatDate: selectedDate"]'
            );
            await page.waitForTimeout(1000);
        }
    } catch (e) { console.log(`Villanova failed: ${e.message}`); }
    await page.close();
    return venueData;
}

// ScottsMiracle-Gro Field scraper
async function scrapeSMG(browser) {
    const page = await browser.newPage();
    const venueData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        console.log(`\n🚀 Scraping ScottsMiracle-Gro Field...`);
        await page.goto('https://scottsmiraclegrofield.com/events/', { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000 
        });

        await page.waitForTimeout(3000);

        try { await page.locator('#onetrust-accept-btn-handler').click({ timeout: 3000 }); } catch (e) {}
        try { await page.locator('.a5-widget-icon-html-close').click({ timeout: 2000 }); } catch (e) {}

        // Scroll to load all cards
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 400;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 150);
            });
        });
        await page.waitForTimeout(1500);

        const rawEvents = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('.fusion-layout-column, .fusion-column-wrapper');

            cards.forEach(card => {
                const titleLink = card.querySelector('h3.fusion-title-heading a, .fusion-title a, h2 a, h3 a');
                if (!titleLink) return;

                const title = titleLink.innerText.trim();
                if (title.toLowerCase().includes('host an event')) return;

                // Extract date from .et-date-underline or p tags
                const dateEl = card.querySelector('.et-date-underline p, .fusion-text p');
                const rawDateStr = dateEl ? dateEl.innerText.trim() : "";

                if (title && rawDateStr) {
                    results.push({
                        title,
                        rawDateStr
                    });
                }
            });

            return results;
        });

        console.log(`📋 Found ${rawEvents.length} distinct SMG cards. Expanding multi-day ranges...`);
        const seen = new Set();

        for (const ev of rawEvents) {
            const cleanTitle = ev.title.replace(/\s+/g, ' ').trim();
            const category = categorizeSMG(cleanTitle);

            // Handle date ranges like "Nov 7 - Nov 13"
            let dates = [];
            const rangeMatch = ev.rawDateStr.match(/([A-Za-z]{3,9})\s+(\d{1,2})\s*-\s*(?:([A-Za-z]{3,9})\s+)?(\d{1,2})(?:,?\s*(\d{4}))?/i);

            if (rangeMatch) {
                const startMonth = rangeMatch[1];
                const startDay = parseInt(rangeMatch[2]);
                const endMonth = rangeMatch[3] || startMonth;
                const endDay = parseInt(rangeMatch[4]);
                const year = rangeMatch[5] || yearForText(`${startMonth} ${startDay}`);

                // Pass into expandDateRange formatted as "Nov 7 - Nov 13, 2026"
                dates = expandDateRange(`${startMonth} ${startDay} - ${endDay}, ${year}`);
            } else {
                dates = [formatDate(`${ev.rawDateStr} ${yearForText(ev.rawDateStr)}`)];
            }

            for (const singleDate of dates) {
                if (singleDate !== "TBA" && new Date(singleDate) < today) continue;

                const dedupeKey = `${singleDate}-${cleanTitle}`;
                if (seen.has(dedupeKey)) continue;
                seen.add(dedupeKey);

                venueData.push({
                    venue: 'ScottsMiracle-Gro Field',
                    title: cleanTitle,
                    date: singleDate,
                    time: 'TBA',
                    type: category
                });

                console.log(`✅ Kept: ${cleanTitle} on ${singleDate} [${category}]`);
            }
        }

    } catch (e) {
        console.log(`❌ ScottsMiracleGro-Field failed: ${e.message}`);
    } finally {
        await page.close();
    }
    return venueData;
}
// =======================================================================================
// MAIN RUNNER

if (require.main === module) (async () => {
    const browser = await chromium.launch({ headless: false });

    const results = await Promise.all([
        scrapeCapitalOne(browser),
        scrapeEnterprise(browser),
        scrapeGoHeels(browser),
        scrapeGrandCasino(browser),
        scrapeKFC(browser),
        scrapeAmerant(browser),
        scrapeCanadaLifeCentre(browser),
        scrapeChartway(browser),
        scrapeFaurotField(browser),
        scrapeTQL(browser),
        scrapeVillanova(browser),
        scrapeSMG(browser)
    ]);

    const rawData = results.flat();
    const allData = dedupeRows(rawData);
    if (rawData.length !== allData.length) console.log(`\n🧹 Removed ${rawData.length - allData.length} duplicate rows`);
    console.log(`\n🏁 Total events scraped: ${allData.length}`);

    const csvWriter = createCsvWriter({
        path: 'calendar-1.csv',
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
        console.log('✅ Done! All events saved to calendar-1.csv');
    } else {
        console.log('⚠️ No data to write to CSV.');
    }

    await browser.close();
})();

module.exports = { scrapeCapitalOne, scrapeEnterprise, scrapeGoHeels, scrapeGrandCasino, scrapeKFC, scrapeAmerant, scrapeCanadaLifeCentre, scrapeChartway, scrapeFaurotField, scrapeTQL, scrapeVillanova, scrapeSMG };
