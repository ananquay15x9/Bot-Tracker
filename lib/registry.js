// lib/registry.js
//
// The list of venues the worker can crawl. registry.json says how the scrapers group into venues and which
// category each belongs to; the crawler files say which scrapers actually exist. A scraper found in a file but
// not in registry.json still appears (as its own venue, category "Other") so a newly added scraper is never
// invisible; a scraper listed in registry.json that isn't in any file is reported as missing.

const fs = require('fs');
const path = require('path');
const { inspectFile } = require('./loader');

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function loadRegistry({ crawlersDir, registryFile }) {
  const curated = JSON.parse(fs.readFileSync(registryFile, 'utf8')).venues;
  const files = fs.existsSync(crawlersDir)
    ? fs.readdirSync(crawlersDir).filter((f) => /^crawler-\d+\.js$/.test(f)).sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0])).map((f) => inspectFile(path.join(crawlersDir, f)))
    : [];
  const available = new Map(); // "crawler-1:scrapeX" -> file info
  for (const f of files) if (f.ok) for (const s of f.scrapers) available.set(`${path.basename(f.file, '.js')}:${s}`, f);

  const warnings = [];
  const used = new Set();
  const venues = curated.map((v) => {
    const scrapers = v.scrapers.map((id) => {
      const [crawler, fn] = id.split(':');
      const ok = available.has(id);
      if (ok) used.add(id);
      else warnings.push(`${v.name}: scraper ${id} was not found (is ${crawler}.js in the crawlers folder, and does it still define ${fn}?)`);
      return { id, file: `${crawler}.js`, fn, crawler: parseInt(crawler.match(/\d+/)[0]), available: ok };
    });
    return { id: v.id || slug(v.name), name: v.name, category: v.category, scrapers };
  });
  for (const [id, f] of available) {
    if (used.has(id)) continue;
    const [crawler, fn] = id.split(':');
    venues.push({ id: slug(`${crawler}-${fn}`), name: fn.replace(/^scrape/, ''), category: 'Other', uncurated: true, scrapers: [{ id, file: f.file, fn, crawler: parseInt(crawler.match(/\d+/)[0]), available: true }] });
    warnings.push(`${id} is in ${f.file} but not in registry.json - shown as its own venue under "Other"`);
  }
  for (const f of files) if (!f.ok) warnings.push(`${f.file}: ${f.error}`);
  return { venues, files, warnings };
}

module.exports = { loadRegistry, slug };
