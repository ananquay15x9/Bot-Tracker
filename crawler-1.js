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

    if (timeStr.toUpperCase().includes('NOON')) {
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

        let startYear = isGoHeels ? getYearForMonth(startMonthStr) : new Date().getFullYear();
        let endYear = isGoHeels ? getYearForMonth(endMonthStr) : new Date().getFullYear();

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

function categorizeCanadaLifeCentre(title, description) {
    const fullText = (title + " " + description).toLowerCase();
    if (fullText.includes('jets') || fullText.includes('nhl')) return 'NHL';
    if (fullText.includes('moose') || fullText.includes('ahl')) return 'AHL';
    if (fullText.includes('sea bears') || fullText.includes('cebl') || fullText.includes('basketball')) return 'CEBL';

    const musicKeywords = ['concert', 'music', 'live', 'band', 'rock', 'orchestra', 'symphony', 'singer', 'festival', 'album', 'billboard'];
    if (musicKeywords.some(kw => fullText.includes(kw))) return 'Concert';

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
    try {
        await page.goto('https://goheels.com/sports/mens-basketball/schedule', { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log(`\nScraping Go Heels...`);

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

        const gameCards = await page.locator('.s-game-card__header-inner-top-inner').all();
        console.log(`Found ${gameCards.length} Go Heels games!`);

        for (const card of gameCards) {
            try {
                const opponent = await card.locator('[data-test-id="s-game-card-standard__header-team-opponent-link"]').innerText();

                let dateText = '';
                const upcomingDate = card.locator('[data-test-id="s-game-card-standard__header-game-date"]');
                const pastDate = card.locator('[data-test-id="s-game-card-standard__header-game-date-details"]');

                if (await upcomingDate.count() > 0) {
                    dateText = await upcomingDate.innerText();
                } else if (await pastDate.count() > 0) {
                    dateText = await pastDate.innerText();
                }

                const timeText = await card.locator('[data-test-id="s-game-card-standard__header-game-time"]').innerText();
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
                    venueData.push({
                        venue: 'Dean Smith Center (Go Heels)',
                        title: cleanTitle,
                        date: singleDate,
                        time: formatTime(finalTime),
                        type: eventType
                    });
                }
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
    try {
        await page.goto('https://www.grandcasinoarena.com/events', { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log(`\nScraping Grand Casino Arena...`);

        try {
            const loadMoreBtn = page.locator('#loadMoreEvents');
            while (await loadMoreBtn.isVisible() && await loadMoreBtn.isEnabled()) {
                await loadMoreBtn.scrollIntoViewIfNeeded();
                await loadMoreBtn.click();
                await page.waitForTimeout(1500);
                if (await loadMoreBtn.getAttribute('disabled') === 'disabled') break;
            }
        } catch (e) {}

        const infoLinks = await page.locator('a.more').all();
        const uniqueUrls = [...new Set(await Promise.all(infoLinks.map(link => link.getAttribute('href'))))];

        for (const detailUrl of uniqueUrls) {
            try {
                const fullUrl = detailUrl.startsWith('http') ? detailUrl : `https://www.grandcasinoarena.com${detailUrl}`;
                await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

                const rawTitle = await page.locator('h1.title').first().innerText();
                const cleanTitle = rawTitle.trim().replace(/\s+/g, ' ');

                let eventType = 'Other';
                let eventDescription = "";
                if (cleanTitle.toLowerCase().includes('wild') || cleanTitle.toLowerCase().includes('vs.')) {
                    eventType = 'NHL';
                } else if (cleanTitle.toLowerCase().includes('pwhl')) {
                    eventType = 'PWHL';
                } else {
                    eventDescription = await page.locator('.event_description').innerText().catch(() => "");
                    eventType = assignType(cleanTitle, eventDescription);
                }

                const showtimes = await page.locator('li.listItem.clearfix').all();
                for (const show of showtimes) {
                    const dateText = await show.locator('.cell.showings_date').innerText().catch(() => "");
                    const timeText = await show.locator('.time.cell').innerText().catch(() => "");

                    const parsedDate = new Date(dateText.trim());
                    const currentYear = new Date().getFullYear();
                    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
                    const day = String(parsedDate.getDate()).padStart(2, '0');
                    const formattedDate = !isNaN(parsedDate.getTime()) ? `${currentYear}-${month}-${day}` : formatDate(dateText);

                    venueData.push({
                        venue: 'Grand Casino Arena',
                        title: cleanTitle,
                        date: formattedDate,
                        time: formatTime(timeText),
                        type: eventType
                    });
                }
                console.log(`Pulling: ${cleanTitle} [${eventType}]`);
            } catch (e) { console.log(`Error scraping Grand Casino detail: ${e.message.substring(0, 45)}`); }
        }
    } catch (e) { console.log(`Grand Casino Arena failed: ${e.message}`); }
    await page.close();
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
                            venue: 'KFC Yum! Center',
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

                    const rawDateString = (month && day) ? `${month.trim()} ${day.trim()}, 2026` : await show.innerText();
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

                    const rawDateString = (month && day) ? `${month.trim()} ${day.trim()}, 2026` : await show.innerText();
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
async function scrapeCanadaLifeCentre(browser) {
    const page = await browser.newPage();
    const venueData = [];
    try {
        await page.goto('https://www.canadalifecentre.ca/events/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log(`\nScraping Canada Life Centre...`);

        const eventItems = await page.locator('div.rhc-widget-upcoming-item').all();
        const eventList = [];

        for (const item of eventItems) {
            try {
                const titleLink = item.locator('a.rhc-title-link');
                const title = (await titleLink.innerText()).trim();
                const url = await titleLink.getAttribute('href');
                const dateText = await item.locator('.rhc-widget-date').innerText();
                const timeText = await item.locator('.rhc-widget-time').innerText();

                if (url) {
                    eventList.push({
                        title,
                        url,
                        rawDate: dateText.trim(),
                        rawTime: timeText.trim()
                    });
                }
            } catch (err) { continue; }
        }

        console.log(`Found ${eventList.length} Canada Life events. Processing details...`);

        for (const event of eventList) {
            try {
                await page.goto(event.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
                const mainArticle = page.locator('article.calendar-events, .rhc-event-wrapper').first();

                let finalDate = "";
                const metaDateLoc = mainArticle.locator('meta[itemprop="startDate"]');
                if (await metaDateLoc.count() > 0) {
                    const metaDate = await metaDateLoc.first().getAttribute('content');
                    finalDate = metaDate.split('T')[0];
                } else {
                    finalDate = formatDate(event.rawDate);
                }

                let finalTime = event.rawTime;
                const startTimeLoc = mainArticle.locator('.icon-postmeta-fc_start_time .fe-extrainfo-value');
                if (await startTimeLoc.count() > 0) {
                    finalTime = await startTimeLoc.innerText();
                }

                let description = "";
                const metaDescLoc = page.locator('meta[itemprop="description"]');
                if (await metaDescLoc.count() > 0) {
                    description = await metaDescLoc.first().getAttribute('content');
                }

                const eventType = categorizeCanadaLifeCentre(event.title, description);
                venueData.push({
                    venue: 'Canada Life Centre',
                    title: event.title,
                    date: finalDate,
                    time: formatTime(finalTime),
                    type: eventType
                });
                console.log(`Pulling ${event.title} [${eventType}]`);
            } catch (e) { console.log(`Error scraping detail for ${event.title}: ${e.message.substring(0, 45)}`); }
        }
    } catch (e) { console.log(`Canada Life failed: ${e.message}`); }
    await page.close();
    return venueData;
}

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
                    const dynamicYear = yearMatch ? yearMatch[0] : new Date().getFullYear().toString();

                    const monthLoc = showingsDateLoc.locator('.m-date__month').first();
                    const dayLoc = showingsDateLoc.locator('.m-date__day').first();
                    const month = (await monthLoc.count() > 0) ? await monthLoc.innerText() : "";
                    const day = (await dayLoc.count() > 0) ? await dayLoc.innerText() : "";

                    if (month && day) cleanDate = formatDate(`${month} ${day} ${dynamicYear}`);

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
                    venue: 'Chartway Arena',
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

async function scrapeFaurotField(browser) {
    const page = await browser.newPage();
    const venueData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        console.log(`\n🚀 Scraping Faurot Field (Mizzou Football)...`);
        await setupTranscendKiller(page);
        
        await page.goto('https://mutigers.com/sports/football/schedule/2026', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        const cardSelector = '.schedule-event-item__top, .schedule-event-item';
        await page.waitForSelector(cardSelector, { timeout: 15000 });

        const gameCards = await page.locator(cardSelector).all();
        console.log(`📋 Found ${gameCards.length} game cards. Filtering for Faurot Field home games...`);

        for (const card of gameCards) {
            try {
                const venueTypeLoc = card.locator('.schedule-event-date__venue-label').first();
                const venueNameLoc = card.locator('.schedule-event-item__venue, .schedule-default-event__venue').first();
                const locationLoc = card.locator('.schedule-event-item__location, .schedule-event-location').first();

                const venueType = (await venueTypeLoc.count() > 0) ? await venueTypeLoc.innerText() : "";
                const venueName = (await venueNameLoc.count() > 0) ? await venueNameLoc.innerText() : "";
                const locationText = (await locationLoc.count() > 0) ? await locationLoc.innerText() : "";
                const fullLocation = `${venueType} ${venueName} ${locationText}`.toUpperCase();

                const isHomeGame = fullLocation.includes('HOME') || 
                                   fullLocation.includes('MEMORIAL STADIUM') || 
                                   fullLocation.includes('FAUROT FIELD') || 
                                   fullLocation.includes('COLUMBIA');

                if (isHomeGame) {
                    const opponentLoc = card.locator('.schedule-default-event__opponent-name').first();
                    let opponent = "";
                    if (await opponentLoc.count() > 0) {
                        opponent = await opponentLoc.innerText();
                    } else {
                        const fallbackNameLoc = card.locator('.schedule-default-event__name').first();
                        if (await fallbackNameLoc.count() > 0) opponent = await fallbackNameLoc.innerText();
                    }
                    if (!opponent) continue;

                    const dateLoc = card.locator('.schedule-event-date__month-day').first();
                    let rawDate = (await dateLoc.count() > 0) ? await dateLoc.innerText() : "";

                    const timeLoc = card.locator('.schedule-event-item-result__label, .schedule-event-date__time').first();
                    let rawTime = (await timeLoc.count() > 0) ? await timeLoc.innerText() : "TBA";

                    const cleanDate = formatDate(`${rawDate} 2026`);
                    const cleanTime = formatTime(rawTime);

                    const eventDate = new Date(cleanDate);
                    if (cleanDate !== 'TBA' && eventDate < today) {
                        continue;
                    }

                    const finalTitle = `MISSOURI VS ${opponent.replace(/\s+/g, ' ').trim().toUpperCase()}`;

                    venueData.push({
                        venue: 'Mizzou: Faurot Field',
                        title: finalTitle,
                        date: cleanDate,
                        time: cleanTime,
                        type: 'NCAA Football'
                    });

                    console.log(`✅ Kept: ${finalTitle} on ${cleanDate} at ${cleanTime}`);
                }
            } catch (err) { console.log(`Error processing Faurot card: ${err.message.substring(0, 45)}`); }
        }
    } catch (e) { console.log(`❌ Faurot Field failed: ${e.message}`); }
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
                        const sportCode = await event.locator('span[data-bind*="sport.short_display"]').innerText();
                        const opponent = await event.locator('span[data-bind*="opponent.title"]').innerText();
                        const eventType = categorizeVillanova(sportCode, opponent);

                        if (!eventType) continue;

                        const eventText = await event.innerText();
                        let finalTime = "TBA";
                        const timeMatch = eventText.match(/(\d{1,2}(:\d{2})?\s*(?:p\.m\.|a\.m\.|AM|PM))/i);
                        if (timeMatch) finalTime = timeMatch[1];

                        venueData.push({
                            venue: 'Finneran Pavilion (Villanova)',
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

        console.log("📜 Loading all SMG event cards...");
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
            const cardElements = document.querySelectorAll('.fusion-layout-column, .tribe-events-pro-photo__event, .fusion-post-grid, .fusion-column-wrapper');

            cardElements.forEach(card => {
                const linkEl = card.querySelector('a[href*="/event/"]');
                if (!linkEl) return;
                const href = linkEl.href;
                if (href.includes('host-an-event')) return;

                let title = "";
                const titleEl = card.querySelector('h2, h3, h4, .fusion-post-title');
                if (titleEl) {
                    title = titleEl.innerText.trim();
                } else {
                    const img = card.querySelector('img');
                    if (img && img.alt) title = img.alt.trim();
                }

                const textContent = card.innerText || "";

                if (title && !results.some(r => r.title === title)) {
                    results.push({
                        title,
                        textContent,
                        href
                    });
                }
            });

            return results;
        });

        console.log(`📋 Found ${rawEvents.length} distinct SMG cards. Processing...`);

        for (const ev of rawEvents) {
            if (ev.title.toLowerCase().includes('just a moment') || ev.title.toLowerCase().includes('scottsmiraclegro')) {
                continue;
            }

            let cleanDate = "TBA";
            const dateMatch = ev.textContent.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/i);
            if (dateMatch) {
                const month = dateMatch[1];
                const day = dateMatch[2];
                const year = dateMatch[3] || '2026';
                cleanDate = formatDate(`${month} ${day} ${year}`);
            }

            let cleanTime = "TBA";
            const timeMatch = ev.textContent.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/i);
            if (timeMatch) {
                cleanTime = formatTime(timeMatch[1]);
            }

            if (cleanDate !== "TBA" && new Date(cleanDate) < today) {
                continue;
            }

            const cleanTitle = ev.title.replace(/\s+/g, ' ').trim().toUpperCase();
            const category = categorizeSMG(cleanTitle + " " + ev.textContent);

            venueData.push({
                venue: 'ScottsMiracle-Gro Field',
                title: cleanTitle,
                date: cleanDate,
                time: cleanTime,
                type: category
            });

            console.log(`✅ Kept: ${cleanTitle} on ${cleanDate} (${cleanTime}) [${category}]`);
        }

    } catch (e) { console.log(`❌ ScottsMiracleGro-Field failed: ${e.message}`); }
    await page.close();
    return venueData;
}

// =======================================================================================
// MAIN RUNNER

(async () => {
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

    const allData = results.flat();
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