// server.js - the crawler worker's HTTP API. The iSite hub is its only client.
//
//   GET  /health            is it up, is a crawl running, memory, and what it found in the crawlers folder
//   GET  /registry          the venues it can crawl (and anything wrong with the crawler files)
//   POST /jobs              start a crawl    { venues:[...] | scrapers:[...] | all:true, requestedBy }
//   GET  /jobs              recent crawls
//   GET  /jobs/:id          one crawl's progress
//   GET  /jobs/:id/rows     the events it collected
//   POST /jobs/:id/cancel   stop a running crawl
// Every request must carry the shared secret in the x-worker-token header.

const path = require('path');
const os = require('os');
const crypto = require('crypto');
const express = require('express');

try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* no .env file - environment variables only */ }

const config = {
  port: parseInt(process.env.WORKER_PORT || '8900', 10),
  host: process.env.WORKER_HOST || '0.0.0.0',
  token: process.env.WORKER_TOKEN || '',
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || '2', 10),
  scraperTimeoutMin: parseFloat(process.env.WORKER_SCRAPER_TIMEOUT_MIN || '8'),
  jobTimeoutMin: parseFloat(process.env.WORKER_JOB_TIMEOUT_MIN || '90'),
  minFreeMb: parseInt(process.env.WORKER_MIN_FREE_MB || '250', 10),
  headless: (process.env.WORKER_HEADLESS || 'false') === 'true',
  keepJobs: parseInt(process.env.WORKER_KEEP_JOBS || '20', 10),
  crawlersDir: path.resolve(process.env.WORKER_CRAWLERS_DIR || path.join(__dirname, 'crawlers')),
  dataDir: path.resolve(process.env.WORKER_DATA_DIR || path.join(__dirname, 'data')),
};
if (!config.token && process.env.WORKER_ALLOW_NO_TOKEN !== '1') {
  console.error('WORKER_TOKEN is not set. Put a long random string in .env (see .env.example) - the worker refuses to start without one.');
  process.exit(1);
}

const { loadRegistry } = require('./lib/registry');
const { JobManager } = require('./lib/jobs');

const registryFile = process.env.WORKER_REGISTRY_FILE ? path.resolve(process.env.WORKER_REGISTRY_FILE) : path.join(__dirname, 'registry.json');
let cached = { at: 0, value: null };
const getRegistry = (fresh = false) => {
  if (fresh || !cached.value || Date.now() - cached.at > 5000) cached = { at: Date.now(), value: loadRegistry({ crawlersDir: config.crawlersDir, registryFile }) };
  return cached.value;
};
const jobs = new JobManager({ dataDir: config.dataDir, crawlersDir: config.crawlersDir, cacheDir: path.join(__dirname, '.cache'), getRegistry: () => getRegistry(true), config });

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => {
  const sent = Buffer.from(String(req.get('x-worker-token') || ''));
  const want = Buffer.from(config.token);
  const ok = process.env.WORKER_ALLOW_NO_TOKEN === '1' || (sent.length === want.length && crypto.timingSafeEqual(sent, want));
  if (!ok) return res.status(401).json({ error: 'bad or missing x-worker-token' });
  next();
});

app.get('/health', (req, res) => {
  const reg = getRegistry();
  res.json({
    ok: true, version: require('./package.json').version, node: process.version, host: os.hostname(),
    busy: !!jobs.currentId, currentJobId: jobs.currentId, uptimeSec: Math.round(process.uptime()),
    freeMemMb: Math.round(os.freemem() / 1048576), totalMemMb: Math.round(os.totalmem() / 1048576),
    config: { concurrency: config.concurrency, scraperTimeoutMin: config.scraperTimeoutMin, headless: config.headless },
    files: reg.files.map((f) => ({ file: f.file, ok: f.ok, scrapers: f.scrapers.length, error: f.error })),
    warnings: reg.warnings,
  });
});

app.get('/registry', (req, res) => res.json(getRegistry(true)));

app.post('/jobs', (req, res) => {
  const body = req.body || {};
  const reg = getRegistry(true);
  const bySid = new Map();
  const byVenue = new Map(reg.venues.map((v) => [v.id, v]));
  for (const v of reg.venues) for (const s of v.scrapers) bySid.set(s.id, s);
  let ids = [];
  if (body.all) ids = [...bySid.values()].filter((s) => s.available).map((s) => s.id);
  else {
    const unknown = [];
    for (const vid of body.venues || []) {
      const v = byVenue.get(vid);
      if (!v) unknown.push(vid);
      else if (!v.scrapers.some((s) => s.available)) unknown.push(`${vid} (its scraper is missing from the crawler files)`);
      else ids.push(...v.scrapers.filter((s) => s.available).map((s) => s.id));
    }
    for (const sid of body.scrapers || []) { const s = bySid.get(sid); if (!s || !s.available) unknown.push(sid); else ids.push(sid); }
    if (unknown.length) return res.status(400).json({ error: `unknown or unavailable: ${unknown.join(', ')}` });
  }
  ids = [...new Set(ids)];
  if (ids.length === 0) return res.status(400).json({ error: 'nothing to crawl - give venues, scrapers, or all:true' });
  try {
    const job = jobs.start({ scraperIds: ids, requestedBy: body.requestedBy });
    res.status(201).json(jobs.view(job));
  } catch (e) {
    if (e.code === 'busy') return res.status(409).json({ error: e.message, currentJobId: e.currentJobId });
    throw e;
  }
});

app.get('/jobs', (req, res) => res.json({ jobs: jobs.list() }));
app.get('/jobs/:id', (req, res) => { const j = jobs.get(req.params.id); if (!j) return res.status(404).json({ error: 'no such crawl' }); res.json(jobs.view(j)); });
app.get('/jobs/:id/rows', (req, res) => { const rows = jobs.getRows(req.params.id); if (!rows) return res.status(404).json({ error: 'no such crawl' }); res.json({ rows }); });
app.post('/jobs/:id/cancel', (req, res) => { const j = jobs.get(req.params.id); if (!j) return res.status(404).json({ error: 'no such crawl' }); res.json({ ok: jobs.cancel(req.params.id) }); });

app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: String(err.message || err) }); });

if (require.main === module) {
  app.listen(config.port, config.host, () => {
    const reg = getRegistry(true);
    console.log(`Crawler worker listening on http://${config.host}:${config.port}`);
    console.log(`  ${reg.venues.length} venues, ${reg.venues.reduce((n, v) => n + v.scrapers.length, 0)} scrapers; up to ${config.concurrency} at a time per crawler file`);
    for (const w of reg.warnings) console.log(`  ! ${w}`);
  });
}
module.exports = { app, jobs, config };
