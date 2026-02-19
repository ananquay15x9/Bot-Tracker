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

// --- CAPITAL ONE TYPE
function categorizeCapitalOne(title, description) {
    const titleLower = title.toLowerCase();
    const descLower = (description || "").toLowerCase();
    const fullText = (titleLower + " " + descLower);

    // 1. nba/nhl/ncaa (keep these high priority)
    if (fullText.includes('wizards') || fullText.includes('nba')) return 'NBA';
    if (fullText.includes('capitals') || fullText.includes('nhl')) return 'NHL';

    //ncaa mb
    const collegeTeams = ['georgetown', 'hoyas', 'creighton', 'villanova', 'marquette', 'providence', 'xavier', 'uconn'];
    const isCollegeGame = collegeTeams.some(team => titleLower.includes(team)) || fullText.includes('men\'s basketball');

    if (isCollegeGame) return 'NCAA MB';

    // wnba
    if (titleLower.includes('mystics') || titleLower.includes('wnba')) return 'WNBA';

    // 2. the concert "catch-all"
    // added 'jyp', 'female', and 'celebrated' based on your TWICE snippet
    const musicKeywords = [
        'k-pop', 'jyp', 'tour', 'album', 'stadium', 'performance',
        'hits', 'billboard', 'artist', 'live', 'music', 'singer',
        'band', 'grammy', 'female group', 'celebrated', 'concert'
    ];

    if (musicKeywords.some(kw => fullText.includes(kw))) {
        return 'Concert';
    }

    return 'Other';
}

// --- ENTERPRISE CENTER TYPE
function categorizeEnterprise(title, description) {
    const titleLower = title.toLowerCase();
    const descLower = (description || "").toLowerCase();
    const fullText = (title + " " + description).toLowerCase();

    // NHL
    if (titleLower.includes('blues') || titleLower.includes('nhl')) {
        return 'NHL';
    }

    // NCAA MB
    if (titleLower.includes('billikens') || titleLower.includes('slu') ||
        titleLower.includes('ncaa') || titleLower.includes('basketball tournament') ||
        titleLower.includes('missouri valley')) return 'NCAA MB';

    // Other
    const familyKeywords = [
        'disney', 'pixar', 'children', 'family', 'mickey', 'frozen', 'marvel'
    ];
    if (familyKeywords.some(kw => fullText.includes(kw))) {
        return 'Other';
    }

    // Concert
    const musicKeywords = [
        'tour', 'album', 'concert', 'live', 'band', 'orchestra', 'symphony',
        'debut', 'grammy', 'special guest', 'performance', 'music', 'festival',
        'performing', 'show', 'comedian', 'comedy', 'live'
    ];
    const isFamilyShow = fullText.includes('disney') || fullText.includes('pixar') || fullText.includes('children') || fullText.includes('family') || fullText.includes('mickey');

    if (musicKeywords.some(kw => fullText.includes(kw))) {
        return 'Concert';
    }

    return 'Other';
}

// --- GO HEELS TYPE
function categorizeGoHeels(title) {
    const titleLower = title.toLowerCase();

    //NCAA MB - UNC basketball games and ACC Tournament
    if (titleLower.includes('unc vs') ||
        titleLower.includes('tar heels') ||
        titleLower.includes('acc tournament') ||
        titleLower.includes('tournament') ||
        titleLower.includes('scrimmage')) {
        return 'NCAA MB';
    }

    //CONCERT - only actual concerts (not tournaments with "tour" in them)
    const musicKeywords = ['concert', 'live music', 'band', 'singer', 'artist'];
    if (musicKeywords.some(kw => titleLower.includes(kw))) {
        return 'Concert';
    }

    //Other
    return 'Other';
}

// --- GRAND CASINO ARENA TYPE
function assignType(title, description) {
    const titleLower = title.toLowerCase();
    const fullText = (title + " " + description).toLowerCase();

    // 1. Identify NHL - Look for 'vs.' primarily in the TITLE, not the description
    const nhlMarkers = ['nhl', 'wild', 'blues', 'capitals', 'blackhawks'];
    const isVersusMatch = titleLower.includes(' vs ') || titleLower.includes(' vs. ');

    if ((nhlMarkers.some(m => fullText.includes(m)) || isVersusMatch) && !fullText.includes('pwhl')) {
        return 'NHL';
    }

    // 2. Identify PWHL
    if (fullText.includes('pwhl') || (fullText.includes('women') && fullText.includes('hockey'))) {
        return 'PWHL';
    }

    // 3. Identify Concerts
    const musicMarkers = ['tour', 'album', 'grammy', 'live', 'artist', 'concert', 'special guest', 'debut'];
    if (musicMarkers.some(m => fullText.includes(m))) {
        return 'Concert';
    }

    return 'Other';
}

//---KFC TYPE
function categorizeKFC(title, description) {
    const titleLower = title.toLowerCase();
    const descLower = (description || "").toLowerCase();
    const fullText = (titleLower + " " + descLower);

    // 1. NCAA MB (Men's Basketball)
    if (fullText.includes("men's basketball") || (titleLower.includes('louisville') && titleLower.includes('basketball') && !titleLower.includes('women'))) {
        return 'NCAA MB';
    }

    // 2. NCAA WB (Women's Basketball)
    if (fullText.includes("women's basketball") || titleLower.includes('women\'s basketball')) {
        return 'NCAA WB';
    }

    // 3. NCAA WVB (Women's Volleyball)
    if (fullText.includes("volleyball") || titleLower.includes('volleyball')) {
        return 'NCAA WVB';
    }

    // 4. CONCERT
    const musicKeywords = ['tour', 'album', 'concert', 'live', 'artist', 'band', 'grammy', 'performing', 'music'];
    if (musicKeywords.some(kw => fullText.includes(kw))) {
        return 'Concert';
    }

    // 5. OTHER
    const otherKeywords = ['disney', 'mickey', 'family', 'kids', 'children', 'expo', 'festival'];
    if (otherKeywords.some(kw => fullText.includes(kw)) || !musicKeywords.some(kw => fullText.includes(kw))) {
        return 'Other';
    }   
}

// --- AMERANT TYPE
function categorizeAmerant(title, description) {
    const titleLower = title.toLowerCase();
    const descLower = (description || "").toLowerCase();
    const fullText = (titleLower + " " + descLower);

    // Mickey - always Other, check first
    if (fullText.includes('mickey') || fullText.includes('disney') || fullText.includes('wwe')) {
        return 'Other';
    }

    // NHL 
    if (titleLower.includes('panthers') || titleLower.includes('nhl') || titleLower.includes('hockey') || titleLower.includes('vs') || titleLower.includes('fla') || 
        titleLower.includes('tor') || titleLower.includes('det') || titleLower.includes('cbj') || titleLower.includes('bos') || titleLower.includes('ott') || 
        titleLower.includes('nyr')) {
        return 'NHL';
    }

    // Concert
    const musicKeywords = ['concert', 'band', 'orchestra', 'symphony', 'choir', 'live', 'performance', 'tour', 'festival', 'show', 'tribute'];
    if (musicKeywords.some(kw => fullText.includes(kw))) {
        return 'Concert';
    }

    // Other (WWE, Disney)
    const otherKeywords = ['disney', 'family', 'kids', 'children', 'expo', 'festival'];
    if (otherKeywords.some(kw => fullText.includes(kw)) || !musicKeywords.some(kw => fullText.includes(kw))) {
        return 'Other';
    }
}

// ---- CANADA LIFE CENTRE TYPE
function categorizeCanadaLifeCentre(title, description) {
    const fullText = (title + " " + description).toLowerCase();

    // 1. NHL
    if (fullText.includes('jets') || fullText.includes('nhl')) return 'NHL';

    // 2. AHL
    if (fullText.includes('moose') || fullText.includes('ahl')) return 'AHL';

    // 3. CEBL
    if (fullText.includes('sea bears') || fullText.includes('cebl') || fullText.includes('basketball')) return 'CEBL';

    // 4. Concert
    const musicKeywords = ['concert', 'music', 'live', 'band', 'rock', 'orchestra', 'symphony', 'singer', 'festival', 'album', 'billboard'];
    if (musicKeywords.some(kw => fullText.includes(kw))) return 'Concert';

    return 'Other';
}

// ---- CHARTWAY TYPE
function categorizeChartway(title) {
    const t = title.toUpperCase();
    if (t.includes("MEN'S BASKETBALL") || t.includes("ODU MBB")) return 'NCAA MB';
    if (t.includes("WOMEN'S BASKETBALL") || t.includes("ODU WBB")) return 'NCAA WB';
    if (t.includes("VOLLEYBALL")) return 'NCAA WVB';
    if (t.includes("WRESTLING")) return 'Wrestling';
    if (t.includes("CONCERT") || t.includes("LIVE IN CONCERT")) return 'Concert';
    return 'Other';
}

// ---- FAUROT FIELD
function categorizeFaurotField(opponent) {
    return 'NCAA Football';

}

// ---- TQL TYPE
function categorizeTQL(title, categoryText) {
    const titleLower = title.toLowerCase();
    const catLower = categoryText.toLowerCase();

    // 1. MLS Next Pro
        if (titleLower.includes('fc cincinnati 2') || titleLower.includes('next pro')) {
            return 'MLS Next Pro';             return 'MLS Next Pro';
        }

        // 2. MLS
        if (titleLower.includes('fc cincinnati') || catLower.includes('soccer')) {
            return 'MLS';
        }

        // 3. Concert
        if (catLower.includes('concert') || titleLower.includes('tour')) {
            return 'Concert';
        }

        // Catch Stadium Tours specifically so they aren't concerts
        if (titleLower.includes('stadium tour')) {
                return 'Other';
            }
        return 'Other'; // Added default fallback
}

// VILLANOVA TYPE
function categorizeVillanova(sportCode, opponent) {
    const text = (sportCode + " " + opponent).toUpperCase();
    if (text.includes('MBB')) return 'NCAA MB';
    if (text.includes('WBB')) return 'NCAA WB';
    if (text.includes('WVB') || text.includes('VOLLEYBALL')) return 'NCAA WVB';
    return null; // skil unwanted sports
}

// ----- ScottsMiracleGro-Field Type
function categorizeSMG(text) {
    const t = text.toLowerCase();
    if (t.includes('concert') || t.includes('tour') || t.includes('live in')) return 'Concert';
    if (t.includes('mls next pro') || t.includes('crew 2')) return 'MLS Next Pro';
    if (t.includes('mls') || t.includes('columbus crew') || t.includes('uswnt')) return 'MLS';
    return 'Other';
}

// ======================================================================================
// Async Capital One Function
async function scrapeCapitalOne(browser) {
    const page = await browser.newPage();
    const venueData = [];
    try {
        await page.goto('https://www.capitalonearena.com/events');
        // Capital One Logic
		console.log(`\nScraping Capital One Arena...`);

        //close popups
        try { await page.getByRole('button', { name: 'Accept All' }).click({timeout: 5000}); } catch(e) {}

        //click "more events" until are all loaded
        while (await page.getByRole('button', { name: 'More Events' }).isVisible()) {
            await page.getByRole('button', { name: 'More Events' }).click();
            await page.waitForTimeout(1000);
    }

    // 1. First, collect all the event URLs from the main list
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

    console.log(`Collected ${eventsToScrape.length} event links. Starting deep scrape...`);

    // 2. Now, visit each detail page one by one
    for (const event of eventsToScrape) {
        try {
        await page.goto(event.url, { waitUntil: 'domcontentloaded' });

        // Grabbing the description from the detail page
        // using textContent to be safe
        let eventDescription = "";
        const descLocator = page.locator('.description_inner');
        if (await descLocator.count() > 0) {
            eventDescription = await descLocator.textContent();
        }

        // 3. categorize using the full description
        const cleanTitle = event.rawTitle.trim().replace(/\s+/g, ' ');
        const eventType = categorizeCapitalOne(cleanTitle, eventDescription);

        console.log(`Pulling: ${cleanTitle} as ${eventType}`);

        // 4. normalize & push (using your existing logic)
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
        } catch (e) { console.log("Capital One Arena failed: ", e); }
    }
        } catch (e) { console.log("Capital One Arena failed: ", e); }
        await page.close();
        return venueData;
    }

// Async Enterprise Function
async function scrapeEnterprise(browser) {
    const page = await browser.newPage();
    const venueData = [];
    try {
        await page.goto('https://www.enterprisecenter.com/events');
        // Enterprise logic
		console.log(`\nScraping Enterprise Center...`);

        // Wait for the main events list to be loaded
        await page.waitForSelector('#eventsList .event-entry', { timeout: 15000 });

        // Click load more until no more events
        try {
            while (true) {
            const loadMoreVisible = await page.isVisible('#loadMoreEvents');
            if (!loadMoreVisible) break;

            const beforeCount = await page.locator('#eventsList .event-entry').count();

            await page.locator('#loadMoreEvents').scrollIntoViewIfNeeded();
            await page.locator('#loadMoreEvents').click();
            console.log('Clicked "Load More" on Enterprise Center...');
            await page.waitForTimeout(2000);

            const afterCount = await page.locator('#eventsList .event-entry').count();
            if (afterCount <= beforeCount) {
                // count and break if no new events loaded
                console.log('No new events after clicking "Load More"; stopping.');
                break;
            }
            }
        } catch (e) {
            console.log('Stopping Load More loop due to an error or page change.');
        }

        // Grab every "Info" link from the events list (after all load-mores)
        const infoLinks = await page.locator('#eventsList a.more').all();
        const urlsToVisit = [];

        for (const link of infoLinks) {
            const href = await link.getAttribute('href');
            if (href) {
            const fulUrl = href.startsWith('http') ? href: `https://www.enterprisecenter.com${href}`;
            urlsToVisit.push(fulUrl);
            }
        }

        //Filter unique URLs
        const uniqueUrls = [...new Set(urlsToVisit)];

        // Click to each detail info page and scrape data
        for (const detailUrl of uniqueUrls) {
            try {
            await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // 1. Grab the Title first (Need this for categorization)
            const eventTitle = await page.locator('h1').innerText();

            // 2. Click "Continue Reading" to expand the description

            let eventDescription = "";
            const descLocator = page.locator('.collapse-wrapper');

            // count() check is instant—it doesn't wait 30 seconds!
            if (await descLocator.count() > 0) {
                try {
                    const readMoreBtn = page.locator('span.readmore');
                    if (await readMoreBtn.isVisible()) {
                    await readMoreBtn.click();
                    await page.waitForTimeout(300);
                    }
                    // get the text since we know the locator exists
                    eventDescription = await descLocator.textContent();
                } catch (e) {
                    console.log("Description exists but couldn't be expanded/read.");
                }
            } else {
                console.log(`No description box found for: ${eventTitle.trim()} - skipping description.`);
            }

            // 4. Categorize
            const eventType = categorizeEnterprise(eventTitle, eventDescription);
            console.log(`Pulling: ${eventTitle.trim()} as ${eventType}`);

            // 5. Process showtimes
            const showtimes = await page.locator('.showings_list li.entry').all();

            for (const show of showtimes) {
                const dateText = await show.locator('.date').innerText();
                const timeText = await show.locator('.time').innerText();
                const rawDateAndTime = `${dateText.trim()} ${timeText.trim()}`;

                const { title, date, time } = normalizeData(rawDateAndTime, eventTitle.trim());
                const formattedDate = formatDate(date);
                const dates = expandDateRange(formattedDate);

                // Add a row for each date in the range
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
            console.log(`Pulling: ${eventTitle.trim()}`);
            } catch (e) { console.log(`Error scraping event detail: ${e}`); }
        }
        } catch (e) { console.log("Enterprise failed: ", e); }
        await page.close();
        return venueData;
}

// Async Go Heels Function
async function scrapeGoHeels(browser) {
    const page = await browser.newPage();
    const venueData = [];
    try {
        await page.goto('https://goheels.com/sports/mens-basketball/schedule');
        // Go Heels logic
		console.log(`\nScraping Go Heels...`);
        //can't seem to close the cookie consent popup lol
        await page.evaluate(()=> {
            const host = document.querySelector('#transcend-consent-manager');
            if (host) host.remove();

            document.documentElement.style.overflow = 'auto';
            document.body.style.overflow = 'auto';
            document.body.style.position = 'static';
        });

        //scroll to the bottom to make sure all game cards are loaded
        try {
            await page.evaluate(async () => {
                await new Promise((resolve) => {
                let totalHeight = 0;
                let distance = 100;
                let timer = setInterval(() => {
                    let scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if(totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    resolve();
                    }
                }, 100);
                });
            });
        } catch (e) {
            console.log('Scrolling failed (page may have navigated or closed), moving on to game card scraping if possible...');
        }

        //find all game card containers
        //every game is wrapped in a card
        const gameCards = await page.locator('.s-game-card__header-inner-top-inner').all();
        console.log(`Found ${gameCards.length} games!`);

        for (const card of gameCards) {
            try {
                const opponent = await card.locator('[data-test-id="s-game-card-standard__header-team-opponent-link"]').innerText();

                // try to find the date in the upcoming games section
                let dateText = '';
                const upcomingDate = card.locator('[data-test-id="s-game-card-standard__header-game-date"]');
                const pastDate = card.locator('[data-test-id="s-game-card-standard__header-game-date-details"]');

                if (await upcomingDate.count() > 0) {
                dateText = await upcomingDate.innerText();
                } else if (await pastDate.count() > 0) {
                dateText = await pastDate.innerText();
            }

            // get time and date
            const timeText = await card.locator('[data-test-id="s-game-card-standard__header-game-time"]').innerText();

            //Clean up
            const cleanTitle = `UNC vs ${opponent.trim()}`;
            const cleanDate = `${dateText.trim()} ${timeText.trim()}`.replace(/\s+/g, ' ');

            console.log(`Pulling: ${cleanTitle}`);

            // Parse date and time
            const rawDateAndTime = `${dateText.trim()} ${timeText.trim()}`;
            let finalDate = rawDateAndTime;
            let finalTime = 'TBA';

            // Check if there's a time in the format (e.g., "6:30 p.m." or "7 p.m.")
            const timeMatch = rawDateAndTime.match(/(\d+(?::\d+)?\s*(?:p\.m\.|a\.m\.))/i);
            if (timeMatch) {
                // Extract time and convert to uppercase PM/AM
                finalTime = timeMatch[1].trim()
                    .replace(/p\.m\./i, 'PM')
                    .replace(/a\.m\./i, 'AM')
                    .replace(/\s+/g, ' ')
                    .trim();


                finalDate = rawDateAndTime.substring(0, timeMatch.index).trim();
                if (finalDate && !finalDate.endsWith(',')) {
                    finalDate = finalDate + ',';
                }
            }

            const eventType = categorizeGoHeels(cleanTitle);

            const formattedDate = formatGoHeelsDate(finalDate);
            const dates = expandDateRange(formattedDate, true);

            // Add a row for each date in the range
            for (const singleDate of dates) {
                venueData.push({
                    venue: 'Dean Smith Center (Go Heels)',
                    title: cleanTitle,
                    date: singleDate,
                    time: formatTime(finalTime),
                    type: eventType
                });
                }
            } catch (e) { console.log(`Error scraping game card: ${e}`); }
        }
    } catch (e) { console.log("Go Heels failed: ", e); }
    await page.close();
    return venueData;
}

// Async Grand Casino
async function scrapeGrandCasino(browser) {
    const page = await browser.newPage();
    const venueData = [];
    try {
        await page.goto('https://www.grandcasinoarena.com/events');
        // Grand Casino Logic
		// expand the list fully
        try {
            const loadMoreBtn = page.locator('#loadMoreEvents');
            while (await loadMoreBtn.isVisible() && await loadMoreBtn.isEnabled()) {
                await loadMoreBtn.scrollIntoViewIfNeeded();
                await loadMoreBtn.click();
                await page.waitForTimeout(1500);
                if (await loadMoreBtn.getAttribute('disabled') === 'disabled') break;
            }
        } catch (e) { console.log('List expanded.'); }

        const infoLinks = await page.locator('a.more').all();
        const uniqueUrls = [...new Set(await Promise.all(infoLinks.map(link => link.getAttribute('href'))))];

        for (const detailUrl of uniqueUrls) {
            try {
            const fullUrl = detailUrl.startsWith('http') ? detailUrl : `https://www.grandcasinoarena.com${detailUrl}`;
            await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // get the title
            const rawTitle = await page.locator('h1.title').first().innerText();
            const cleanTitle = rawTitle.trim().replace(/\s+/g, ' ');

            // check tyope
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
                const dateText = await show.locator('.cell.showings_date').innerText();
                const timeText = await show.locator('.time.cell').innerText();

                // Format date as YYYY-MM-DD
                const parsedDate = new Date(dateText.trim());
                const currentYear = new Date().getFullYear();
                const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
                const day = String(parsedDate.getDate()).padStart(2, '0');
                const formattedDate = `${currentYear}-${month}-${day}`;

                // Format time as 12:00AM or 12:00PM
                const timeMatch = timeText.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
                let formattedTime = timeText.trim();
                if (timeMatch) {
                    let hours = parseInt(timeMatch[1]);
                    const minutes = timeMatch[2];
                    let period = timeMatch[3]?.toUpperCase();

                    // If no AM/PM provided, assume 24-hour format
                    if (!period) {
                        period = hours >= 12 ? 'PM' : 'AM';
                        hours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
                    }

                formattedTime = `${hours}:${minutes}${period}`;
            }

            venueData.push({
                venue: 'Grand Casino Arena',
                title: cleanTitle,
                date: formattedDate,
                time: formattedTime,
                type: eventType
            });
        }
            console.log(`Pulling: ${cleanTitle} [${eventType}]`);
        } catch (e) { console.log(`Error scraping event detail: ${e}`); }
    }
} catch (e) { console.log("Grand Casino Arena failed: ", e); }
    await page.close();
    return venueData;
}

// Async KFC Yum Center
async function scrapeKFC(browser) {
    const page = await browser.newPage();
    const venueData = [];
    try {
        await page.goto('https://www.kfcyumcenter.com/events');
        // KFC Logic
		console.log(`\nScraping KFC Yum Center...`);

        // --- LOAD ALL EVENTS ---
        try {
            const loadMoreBtn = page.locator('#loadMoreEvents');
            while (await loadMoreBtn.isVisible()) {
                await loadMoreBtn.scrollIntoViewIfNeeded();
                await loadMoreBtn.click();
                await page.waitForTimeout(1500); // wait for boxes to load

            }
        } catch (e) {
            console.log('Finished loading all events.');
        }

        // --- COLLECT LINKS ---
        const eventLinks = await page.locator('h3.title a').all();
        const urlsToVisit = [];

        for (const link of eventLinks) {
            const href = await link.getAttribute('href');
            if (href) urlsToVisit.push(href.startsWith('http') ? href : `https://www.kfcyumcenter.com${href}`);
        }
        const uniqueUrls = [...new Set(urlsToVisit)].filter(url => url.includes('/events/detail/'));
        console.log(`Found ${uniqueUrls.length} unique events to deep scrape.`);

        // --- SCRAPING ---
        for (const detailUrl of uniqueUrls) {
            try {
            await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // grab dynamic content
            const eventTitle = await page.locator('h1.title').innerText();

            //click 'more info' if it exists to get full keywords
            try {
                const moreInfoBtn = page.locator('button.read-more');
                if (await moreInfoBtn.isVisible()) {
                await moreInfoBtn.click();
                await page.waitForTimeout(300);
                }
            } catch (e) {}

            const eventDescription = await page.locator('.description_inner').textContent();
            const eventType = categorizeKFC(eventTitle, eventDescription);

            //find showings
            const showtimeItems = await page.locator('ul.list li.listItem').all();

            if (showtimeItems.length === 0) {
                console.log(`No showings found for ${eventTitle}, skipping.`);
                continue;
            }

            for (const show of showtimeItems) {
                //Extract date parts from the nested spans
                const month = await show.locator('.m-date__month').innerText();
                const day = await show.locator('.m-date__day').innerText();
                const time = await show.locator('.time.cell').innerText();

                // format the date time
                const rawDateString = `${month.trim()} ${day.trim()}, 2026`;

                //clean title/date/time
                const { title, date, time: cleanTime } = normalizeData(`${rawDateString} ${time}`, eventTitle);
                const formattedDate = formatDate(date);

                venueData.push({
                venue: 'KFC Yum! Center',
                title: title,
                date: formattedDate,
                time: formatTime(time),
                type: eventType
                });
            }
            console.log(`Pulling: ${eventTitle} [${eventType}]`);
        } catch (e) { console.log(`Error scraping event detail: ${e}`); }
    }
} catch (e) { console.log("KFC failed: ", e); }
    await page.close();
    return venueData;
}

// Async Amerant Function
async function scrapeAmerant(browser) {
	const page = await browser.newPage();
	const venueData = [];
	try {
	await page.goto('https://www.amerantbankarena.com/events');
	// Amerant Logic
	console.log(`\nScraping Amerant Bank Arena...`);

    // LOAD ALL EVENTS
    console.log('Loading all events');
    try {
        const loadMoreBtn = page.locator('#loadMoreEvents');
        while (await loadMoreBtn.isVisible() && !(await loadMoreBtn.getAttribute('disabled'))) {
            await loadMoreBtn.scrollIntoViewIfNeeded();
            await loadMoreBtn.click();
            await page.waitForTimeout(1500);
        }
    } catch (e) {
        console.log('Finished loading events list.');
    }

    // COLLECT LINKS
    const eventLinks = await page.locator('h3.title a').all();
    const urlsToVisit = [];
    for (const link of eventLinks) {
        const href = await link.getAttribute('href');
        if (href) urlsToVisit.push(href.startsWith('http') ? href : `https://www.amerantbankarena.com${href}`);
    }

    const uniqueUrls = [...new Set(urlsToVisit)].filter(url => url.includes('/events/detail/'));
    console.log(`Found ${uniqueUrls.length} unique events to deep scrape.`);

    // SCRAPING
    for (const detailUrl of uniqueUrls) {
        try {
            await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            const eventTitle = await page.locator('h1.title').first().innerText();

        //Expand description if button exists
        try {
            const moreInfoBtn = page.locator('button.read-more');
            if (await moreInfoBtn.isVisible()) {
                await moreInfoBtn.click();
                await page.waitForTimeout(300);
            }
        } catch (e) {}

        const eventDescription = await page.locator('.description_inner').textContent();
        const eventType = categorizeAmerant(eventTitle, eventDescription);

        // loop through multiple showtimes
        const showtimeItems = await page.locator('ul.list li.listItem').all();

        for (const show of showtimeItems) {
            const month = await show.locator('.m-date__month').innerText();
            const day = await show.locator('.m-date__day').innerText();
            const time = await show.locator('.time.cell').innerText();

            //format the raw date
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth();

            const monthMap = {
                'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3,
                'may': 4, 'jun': 5, 'jul': 6, 'aug': 7,
                'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
            };

            const eventMonthName = month.trim().toLowerCase().substring(0,3);
            const eventMonthNum = monthMap[eventMonthName];

            // If the event month is less than the current month, assume it's next year
            let targetYear = currentYear;
            if (eventMonthNum < currentMonth) {
                targetYear = currentYear + 1;
            }

            const rawDateString = `${month.trim()} ${day.trim()}, ${targetYear}`;

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
    } catch (e) { console.log(`Error scraping event detail: ${e}`); }
}
	} catch (e) { console.log("Amerant failed. ", e); 

    } finally {
	    await page.close();
    }
	return venueData;
}

// Canada Life Centre Main Function
async function scrapeCanadaLifeCentre(browser) {
	const page = await browser.newPage();
	const venueData = [];
	try {
        await page.goto('https://www.canadalifecentre.ca/events/');
        // Amerant Logic
        console.log(`\nScraping Canada Life Centre...`);

        // 1. Collect event data
        const eventItems = await page.locator('div.rhc-widget-upcoming-item').all();
        const eventList = [];

        console.log(`Scanning front page... Found ${eventItems.length} events. Extracting details...`);


        for (const item of eventItems) {
            try{
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
            } catch (err) {
                continue;
            }
        }

        console.log(`Found ${eventList.length} events. Processing details...`);

        // 2. SCRAPE
        for (const event of eventList) {
            try {
                await page.goto(event.url, { waitUntil: 'domcontentloaded' });

                const mainArticle = page.locator('article.calendar-events, .rhc-event-wrapper').first();

                let finalDate ="";
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

                //Grab description
                let description = "";
                const metaDescLoc = await page.locator('meta[itemprop="description"]');
                const metaDesc = (await metaDescLoc.count() > 0)
                    ? await metaDescLoc.first().getAttribute('content')
                    : "";

                const articleBody = await mainArticle.innerText() || "";
                description = `${metaDesc} ${articleBody}`;

                const eventType = categorizeCanadaLifeCentre(event.title, description);
                venueData.push({
                    venue: 'Canada Life Centre',
                    title: event.title,
                    date: finalDate,
                    time: formatTime(finalTime),
                    type: eventType
                });
            console.log(`Pulling ${event.title} [${eventType}]`);
            } catch (e) {
                console.log(`Error scraping detail for ${event.title}: ${e.message}`);
            }
        }
    } catch (e) { console.log(`Canada Life failed: ${e.message}`); }
    await page.close();
    return venueData;
}

// Chartway main Function
async function scrapeChartway(browser) {
	const page = await browser.newPage();
	const venueData = [];
	try {
        await page.goto('https://www.chartwayarena.com/events');
        // Amerant Logic
        console.log(`\nScraping Chartway Arena...`);

        // CLICK the COOKIE BUTTON (this sucks!)
        try {
            const cookieBtn = page.getByRole('button', { name: 'Accept All Cookies' });
            await cookieBtn.waitFor({ state: 'visible', timeout: 8000 });
            await cookieBtn.click();
            await page.waitForTimeout(2000);
        } catch (e) { console.log("No cookie popup to click."); }

        //expand main list
        console.log("Expanding event list...");
        const moreBtn = page.locator('#loadMoreEvents');
        while (await moreBtn.isVisible()) {
            await moreBtn.click();
            console.log("Clicked 'More Events'");
            await page.waitForTimeout(1500);
        }

        // Collect URLs from the Images
        const urls = await page.evaluate(() => {
            const imageLinks = Array.from(document.querySelectorAll('.eventItem .thumb a'));
            return imageLinks.map(a => a.href);
        });

        console.log(`Found ${urls.length} events. Starting pulling...`);
        const today = new Date().toISOString().split('T')[0];

        // Visit each detail page
        for (const url of urls) {
            try {
                await page.goto(url, { waitUntil: 'load' });

                //Expand
                const moreDetailsBtn = page.locator('button.read-more').filter({ hasText: 'More Details' });
                if (await moreDetailsBtn.isVisible()) {
                    await moreDetailsBtn.click();
                    await page.waitForTimeout(500); 
                }

                const title = await page.locator('h1.title').first().innerText();


                //Extract from the .showings_date
                const showingsDateLoc = page.locator('.showings_date').first();
                const ariaLabel = await showingsDateLoc.getAttribute('aria-label') || "";
                const yearMatch = ariaLabel.match(/\d{4}/);
                const dynamicYear = yearMatch ? yearMatch[0] : new Date().getFullYear().toString();

                const month = await showingsDateLoc.locator('.m-date__month').first().innerText();
                const day = await showingsDateLoc.locator('.m-date__day').first().innerText();

                const cleanDate = formatDate(`${month} ${day} ${dynamicYear}`);

                if (cleanDate < today) continue;

                // Extract Time from .m-date__hour (Handles the "@ 8:00PM" format)
                let eventTime = "TBA";
                const hourLoc = showingsDateLoc.locator('.m-date__hour').first();
                
                if (await hourLoc.count() > 0) {
                    const rawHour = await hourLoc.innerText();
                    eventTime = rawHour.replace('@', '').trim();
                }

                const description = await page.locator('.description_inner').first().innerText();

                venueData.push({
                    venue: 'Chartway Arena',
                    title: title.trim(),
                    date: cleanDate,
                    time: formatTime(eventTime),
                    type: categorizeChartway(title + " " + description)
                });

                console.log(`Pulling ${title.trim()} [${cleanDate}]`);
            } catch (err) {
                console.log(`Failed on ${url}: ${err.message.substring(0, 50)}`);
            }
        }
        
    } catch (e) { console.log(`Chartway failed: ${e.message}`); }
    await page.close();
    return venueData;
}

// Faurot Field Main Function
async function scrapeFaurotField(browser) {
	const page = await browser.newPage();
	const venueData = [];
	try {
        await setupTranscendKiller(page);
        await page.goto('https://mutigers.com/sports/football/schedule/2026');
        // Amerant Logic
        console.log(`\nScraping Faurot Field...`);

        const today = new Date().toISOString().split('T')[0];

        // Wait to load
        await page.waitForSelector('[data-test-id="s-game-card-standard__root"]');

        // target all game cards
        const gameCards = await page.locator('[data-test-id="s-game-card-standard__root"]').all();
        console.log(`Found ${gameCards.length} scheduled games.`);

        for (const card of gameCards) {
            try {
                // VENUE & LOCATION CHECK
                const venueLoc = card.locator('[data-test-id*="game-facility-title-link"]');
                const cityLoc = card.locator('[data-test-id*="standard-location-details"]');
                
                if (await venueLoc.count() === 0) continue;
                
                const venueName = await venueLoc.innerText();
                const cityText = await cityLoc.innerText();

                // Only pull if it's at Faurot Field in Columbia, MO
                if (venueName.includes('Faurot Field') && cityText.includes('Columbia')) {
                
                const opponent = await card.locator('[data-test-id="s-game-card-standard__header-team-opponent-link"]').innerText();

                    // time extraction
                    let rawDate = "";
                    const futureDateLoc = card.locator('[data-test-id="s-game-card-standard__header-game-date"]');
                    const pastDateLoc = card.locator('[data-test-id="s-game-card-standard__header-game-date-details"]');

                    if (await pastDateLoc.count() > 0) {
                        // This handles the 2025 completed game layout
                        rawDate = await pastDateLoc.innerText();
                    } else {
                        // This handles the 2026 upcoming game layout
                        rawDate = await futureDateLoc.innerText();
                    }

                    // 3. DUAL TIME EXTRACTION
                    let gameTime = "TBA";
                    const timeLoc = card.locator('[aria-label="Event Time"]');
                    if (await timeLoc.count() > 0) {
                        gameTime = await timeLoc.innerText();
                    }

                    // Determine year based on URL or current context
                    const yearStr = page.url().includes('2025') ? '2025' : '2026';
                    const cleanDate = formatDate(`${rawDate} ${yearStr}`);

                    venueData.push({
                        venue: 'Mizzou: Faurot Field',
                        title: `Missouri vs ${opponent.trim()}`,
                        date: cleanDate,
                        time: formatTime(gameTime),
                        type: 'NCAA Football'
                    });
                    console.log(`Pulling Missouri vs ${opponent.trim()} on ${cleanDate} at ${formatTime(gameTime)}`);
                }
            } catch (err) {
                console.log(`Error processing a game card: ${err.message}`);
            }
        }
        
    } catch (e) { console.log(`Faurot Field failed: ${e.message}`); }
    await page.close();
    return venueData;
}

// TQL Main Function
async function scrapeTQL(browser) {
	const page = await browser.newPage();
    const today = new Date().toISOString().split('T')[0];
	const venueData = [];
	try {
        await setupTranscendKiller(page);
        await page.goto('https://tqlstadium.com/events');
        // Main Logic
        console.log(`\nScraping TQL...`);

        // Event containers
        const eventItems = await page.locator('.eventlist-column-info').all();
        console.log(`Found ${eventItems.length} events at TQL Stadium.`);

        for (const item of eventItems) {
            try {
                const title = await item.locator('.eventlist-title-link').innerText();
                const categoryText = await item.locator('.eventlist-cats').innerText();
                const rawDate = await item.locator('time.event-date').getAttribute('datetime');

                // Skip past events
                if (rawDate < today) {
                    console.log(`Skipping past event: ${title} on ${rawDate}`);
                    continue;
                }

                // Grab start time only
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
            } catch (err) {
                console.log(`Error processing an event: ${err.message}`);
                continue;
            }
        }  
        
    } catch (e) { console.log(`TQL failed: ${e.message}`); }
    await page.close();
    return venueData;
}

// Villanova Main Function
async function scrapeVillanova(browser) {
	const page = await browser.newPage();
    const today = new Date().toISOString().split('T')[0];
	const venueData = [];
	try {
        await setupTranscendKiller(page);
        await page.goto('https://villanova.com/calendar');
        // Main Logic
        console.log(`\nScraping Villanova...`);

        const monthsToScrape = 12; //Full year

        //====SCRAPE DATA FOR 12 MONTHS====//
        for (let i = 0; i < monthsToScrape; i++) {
            // wait for the month to be ready
            const header = page.locator('span[data-bind*="formatDate: selectedDate"]').first();
            await header.waitFor({ state: 'visible' });
            const monthYearText = await header.innerText();

            console.log(`Scraping: ${monthYearText}`);

            // EXPAND ALL HIDDEN EVENTS (GOD DAMMIT)
            const expandButtons = await page.locator('button.sidearm-calendar-table-cell-toggle-button').all();
            console.log(`Expanding ${expandButtons.length} days...`);

            for (const btn of expandButtons) {
                try {
                    // Some buttons might already be expanded or hidden
                    if (await btn.isVisible()) {
                        await btn.click();
                    }
                } catch (e) {
                    continue;
                }
            }

            await page.waitForTimeout(1000);


            // scrape the grid
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
                        
                        // 1. APPLY TARGETED SPORT FILTER
                        const eventType = categorizeVillanova(sportCode, opponent);
                        
                        // If the sport isn't MBB, WBB, or WVB, skip it 
                        if (!eventType) continue;

                        // 2. GREEDY TIME EXTRACTION
                        const eventText = await event.innerText();
                        let finalTime = "TBA";
                        const timeMatch = eventText.match(/(\d{1,2}(:\d{2})?\s*(?:p\.m\.|a\.m\.|AM|PM))/i);
                        if (timeMatch) finalTime = timeMatch[1];

                        // 3. PUSH DATA
                        venueData.push({
                            venue: 'Finneran Pavilion (Villanova)',
                            title: `${sportCode} vs ${opponent}`,
                            date: cleanDate,
                            time: formatTime(finalTime),
                            type: eventType
                        });
                        console.log(`   > Targeted Pulled: ${sportCode} vs ${opponent}`);

                    } catch (err) { continue; }
                }
            }

            // Move to next month and wait for transition
            await page.locator('button.slick-next').first().click();
            // wait for header to change so we don't scrape the same month again
            await page.waitForFunction(
                (old, sel) => document.querySelector(sel)?.innerText !== old,
                monthYearText,
                'span[data-bind*="formatDate: selectedDate"]'
            );
            await page.waitForTimeout(1500);
        }
        
    } catch (e) { console.log(`Villanova failed: ${e.message}`); }
    await page.close();
    return venueData;
}

// ScottsMiracleGro Main Function
async function scrapeSMG(browser) {
	const page = await browser.newPage();
    const today = new Date().toISOString().split('T')[0];
	const venueData = [];
	try {
        await setupTranscendKiller(page);
        await page.goto('https://scottsmiraclegrofield.com/events/');
        // Main Logic
        // clear popup
        try {
            await page.locator('#onetrust-accept-btn-handler').click({ timeout: 5000 });
            console.log("Accepted Cookies");
        } catch (e) {}

        try {
            await page.locator('.a5-widget-icon-html-close').click({ timeout: 5000 });
            console.log("Closed AI Chatbot");
        } catch (e) {}

        // Infinite scroll to load events
        console.log("Scrolling to load all events...");
        let previousHeight;
        while (true) {
            previousHeight = await page.evaluate('document.body.scrollHeight');
            await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
            await page.waitForTimeout(2000);
            let newHeight = await page.evaluate('document.body.scrollHeight');
            if (newHeight === previousHeight) break;
        }

        // Collect URLs
        const urls = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('.fusion-image-element a'));
            return links
                .map(a => a.href)
                .filter(href => href.includes('/event/') && !href.includes('host-an-event'));
        });

        const uniqueUrls = [...new Set(urls)];
        console.log(`Filtered to ${uniqueUrls.length} valid events. Starting scraping...`)

        const today = new Date().toISOString().split('T')[0];

        for (const url of uniqueUrls) {
            try {
                await page.goto(url, { waitUntil: 'load', timeout: 30000 });

            try { await page.locator('#onetrust-accept-btn-handler').first().click({ timeout: 2000 }); } catch(e) {}
                //Extract title
                const title = await page.locator('h1').first().innerText();

                //extract date
                let cleanDate = "TBA";
                const dateTitle = page.locator('.fusion-title:has-text("Date")').first();

                if (await dateTitle.count() > 0) {
                    let rawDate = await dateTitle.locator('xpath=following-sibling::div[contains(@class, "fusion-text")]//p').innerText();

                    if (rawDate) {
                        // CLEANING STEP: If it's one of those "Mar 8at3:00 pm" strings,
                        // split it at "at" and just take the first part ("Mar 8")
                        let dateOnly = rawDate.split(/at|\s@/i)[0].trim();

                        if (!dateOnly.toLowerCase().includes('sale')) {
                            cleanDate = formatDate(`${dateOnly} 2026`);
                        }
                    }
                }

                if (cleanDate < today && cleanDate !== "TBA") continue;

                //extract time
                let eventTime = "TBA";
                const timeTitle = page.locator('.fusion-title:has-text("Time")').first();
                if (await timeTitle.count() > 0) {
                    const rawTime = await timeTitle.locator('xpath=following-sibling::div[contains(@class, "fusion-text")]//p').innerText();
                    if (rawTime && !rawTime.toLowerCase().includes('sale')) {
                        eventTime = formatTime(rawTime.trim());
                    }
                }

                // description
                let description = "";
                const descLoc = page.locator('.fusion-content-tb').first();
                if (await descLoc.count() > 0) description = await descLoc.innerText();

                venueData.push({
                    venue: 'ScottsMiracle-Gro Field',
                    title: title.trim(),
                    date: cleanDate,
                    time: eventTime,
                    type: categorizeSMG(title + " " + description)
                });
                console.log(`Pulling ${title.trim()} [${eventTime}]`);
            } catch (err) {
                console.log(`Failed on ${url}: ${err.message.substring(0, 50)}`)
            }
        }
    } catch (e) { console.log(`ScottsMiracleGro-Field failed: ${e.message}`); }
    await page.close();
    return venueData;
}


// =======================================================================================

(async () => {
	const browser = await chromium.launch ({ headless: false });

	//run them one by one to keep memory clean
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

    // flatten the array
    const allData = results.flat();

    //log the count
    console.log(`\nTotal events scraped: ${allData.length}`);

    // write to CSV
    const csvWriter = createCsvWriter({
        path: 'calendar.csv', 
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
        console.log('Done! All events saved to calendar.csv');
    } else {
        console.log('No data to write to CSV.');
    }

	await browser.close();
})();