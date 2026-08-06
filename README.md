# Event Tracker 

A bot crawler built with Node.js and Playwright. This bot will scrape multiple major arena websites to generate a CSV calendar.

## Getting Started

Follow these steps to set up the bot on your local machine.

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed.
For servers:
* **xvfb** (Virtual Frame Buffer) to run the browser without a physical monitor

```bash
# Ubuntu/Debian
sudo apt-get install xvfb
# Fedora
sudo dnf install xorg-x11-server-Xvfb
```


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

# Optional: Linux server
npx playwright install-deps 

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

    Mizzou Arena

    Providence Park

    Shell Energy Stadium

    Subaru Park

```bash
#CRAWLER 4
# Command
node crawler-4.js

# Output
calendar-4.csv
```
Venues:

    Xfinity Center (Sports & Events)

    Enmarket

    LSU-PMAC

    Allianz Field


### 4. Server Deployment
| Command |  Action | Output
|:-----|:--------:|:---------:|
| npm run c1   | Run Crawler 1 | calendar-1.csv
| npm run c2   | Run Crawler 2| calendar-2.csv
| npm run c3  | Run Crawler 3| calendar-3.csv
| npm run c4  | Run Crawler 4| calendar-4.csv
| npm run all | Run all crawlers sequentially | All CSVs
---

### 5. CSV Structure
All exported files follow this standardized format for easy importing into calendar apps or databases:

VENUE: Name of the facility

EVENT NAME: Title of the match or performance

DATE: YYYY-MM-DD

TIME: HH:MM AM/PM

TYPE: Category (e.g., NHL, MLS, PLL, Concert, etc.)

