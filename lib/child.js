// lib/child.js
//
// Runs some scrapers from ONE crawler file, in its own process (so a crash or a memory blow-up can only
// affect this file's scrapers, and all of its memory is handed back when it exits). Started by lib/jobs.js.
// It talks to its parent by printing one JSON object per line:
//   {type:'start', scraper}   {type:'log', scraper, line}   {type:'done', scraper, rows, ms}
//   {type:'error', scraper, error, ms, timeout}              {type:'finished'}   {type:'fatal', error}

const fs = require('fs');
const os = require('os');
const util = require('util');
const { AsyncLocalStorage } = require('async_hooks');
const { prepare } = require('./loader');

const als = new AsyncLocalStorage();
const emit = (o) => process.stdout.write(JSON.stringify(o) + '\n');

// The scrapers print progress with console.log. Turn that into log events tagged with the scraper that printed
// it (AsyncLocalStorage follows the scraper across all its awaits, even with several running at once).
for (const level of ['log', 'info', 'warn', 'error']) {
  console[level] = (...args) => emit({ type: 'log', scraper: als.getStore()?.scraper ?? null, line: util.format(...args).slice(0, 400) });
}

function availableMb() {
  try {
    const m = fs.readFileSync('/proc/meminfo', 'utf8').match(/MemAvailable:\s+(\d+) kB/);
    if (m) return parseInt(m[1], 10) / 1024;
  } catch { /* not Linux */ }
  return os.freemem() / 1048576;
}

async function waitForMemory(minMb, maxWaitMs) {
  const until = Date.now() + maxWaitMs;
  while (availableMb() < minMb && Date.now() < until) await new Promise((r) => setTimeout(r, 2000));
}

const clean = (v) => (v === undefined || v === null ? '' : String(v).trim());
function normalizeRows(rows) {
  if (!Array.isArray(rows)) throw new Error(`the scraper returned ${rows === undefined ? 'nothing' : typeof rows}, not a list of events`);
  return rows.filter((r) => r && typeof r === 'object').map((r) => ({ venue: clean(r.venue), title: clean(r.title), date: clean(r.date), time: clean(r.time), type: clean(r.type) }));
}

(async () => {
  const args = JSON.parse(process.env.WORKER_CHILD_ARGS);
  const mod = require(prepare(args.file, args.cacheDir));

  let browser;
  if (process.env.WORKER_BROWSER === 'none') {
    browser = { close: async () => {}, newPage: async () => { throw new Error('no browser in test mode'); } };
  } else {
    const { chromium } = require('playwright');
    browser = await chromium.launch({ headless: args.headless });
  }

  const queue = [...args.scrapers];
  const worker = async () => {
    while (queue.length) {
      const name = queue.shift();
      const started = Date.now();
      await waitForMemory(args.minFreeMb, 60000);
      emit({ type: 'start', scraper: name });
      try {
        if (typeof mod[name] !== 'function') throw new Error(`${name} is not exported by this file`);
        let timer;
        const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error(`took longer than ${Math.round(args.timeoutMs / 60000)} minutes`), { timeout: true })), args.timeoutMs); });
        const rows = await Promise.race([als.run({ scraper: name }, () => mod[name](browser)), timeout]).finally(() => clearTimeout(timer));
        emit({ type: 'done', scraper: name, rows: normalizeRows(rows), ms: Date.now() - started });
      } catch (e) {
        emit({ type: 'error', scraper: name, error: String((e && e.message) || e).slice(0, 300), timeout: !!(e && e.timeout), ms: Date.now() - started });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(args.concurrency, queue.length)) }, worker));
  await Promise.race([browser.close().catch(() => {}), new Promise((r) => setTimeout(r, 10000))]);
  emit({ type: 'finished' });
  process.exit(0); // a scraper that timed out may still be running in the background - don't wait for it
})().catch((e) => {
  emit({ type: 'fatal', error: String((e && e.stack) || e).slice(0, 600) });
  process.exit(1);
});
