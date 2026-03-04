# Event Tracker 

A bot crawler built with Node.js and Playwright. This bot will scrape multiple major arena websites to generate a CSV calendar.

## Getting Started

Follow these steps to set up the bot on your local machine.

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed.

### 2. Installation
Clone the repository and install the required modules:
```bash
git clone https://github.com/ananquay15x9/Bot-Tracker.git
cd bot-tracker
```

```bash
# Install the library dependencies
npm install

# Install Playwright
npm install playwright

# Install the browser binaries (Chromium)
npx playwright install chromium

# Install the CSV convert tool
npm install csv-writer

```

### 3. Usage
The tracker is split into three main crawlers to optimize performance and organization. Run the specific script to generate its corresponding calendar.
```bash
#CRAWLER 1
# Command
node crawler-1.js

# Output
calendar-1.csv
```
Venues:

    Capital One Arena

    Enterprise Center

    Dean Smith Center (Go Heels!)

    Grand Casino Arena

    KFC Yum! Center

    Amerant Bank Arena

    Canada Life Centre

    Chartway Arena

    Mizzou: Faurot Field

    TQL Stadium

    Finneran Pavilion (Villanova)

    ScottsMiracle-Gro

```bash
#CRAWLER 2
# Command
node crawler-2.js

# Output
calendar-2.csv
```
Venues:

    John Paul Jones Arena

    Virginia Tech - Cassell Coliseum

    Bryce Jordan Center

    America First Field

    Neville Arena

```bash
#CRAWLER 3
# Command
node crawler-3.js

# Output
calendar-3.csv
```
Venues:

    Foster Pavilion

    Xfinity Center (Sports & Events)

    Mizzou Arena

    Providence Park

    Shell Energy Stadium

    Subaru Park

### 4. CSV Structure
All exported files follow this standardized format for easy importing into calendar apps or databases:

VENUE: Name of the facility

EVENT NAME: Title of the match or performance

DATE: YYYY-MM-DD

TIME: HH:MM AM/PM

TYPE: Category (e.g., NHL, MLS, PLL, Concert, etc.)

