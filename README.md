# Bot-Tracker

This tool automatically scrapes event schedules from sports arena websites.

## Getting Started

Follow these steps to set up the bot on your local machine.

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed.

### 2. Installation
Clone the repository and install the required modules:

```bash
# Install the library dependencies
npm install

# Install the browser binaries (Chromium)
npx playwright install chromium

# Install the CSV convert tool
npm install csv-writer

# To run the scraper and generate the events.csv file
node scraper.js

```