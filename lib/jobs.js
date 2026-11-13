// lib/jobs.js
//
// One crawl = one "job". Only one job runs at a time. A job is a list of scrapers; they're grouped by crawler
// file and each file runs in its own child process (lib/child.js), one file after another. Job state is saved
// to disk as it changes, so a restart never loses the results already collected.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');
const crypto = require('crypto');

const LOG_KEEP = 40;

class JobManager {
  constructor({ dataDir, crawlersDir, cacheDir, getRegistry, config }) {
    this.dir = path.join(dataDir, 'jobs');
    this.crawlersDir = crawlersDir;
    this.cacheDir = cacheDir;
    this.getRegistry = getRegistry;
    this.config = config;
    this.jobs = new Map();   // id -> job
    this.rows = new Map();   // id -> [{scraper, venue, title, date, time, type}]
    this.currentId = null;
    this.child = null;
    this.saveTimers = new Map(); // kept out of the job object so the job can always be written to disk
    fs.mkdirSync(this.dir, { recursive: true });
    this.#loadFromDisk();
  }

  #loadFromDisk() {
    for (const id of fs.readdirSync(this.dir)) {
      try {
        const job = JSON.parse(fs.readFileSync(path.join(this.dir, id, 'job.json'), 'utf8'));
        if (job.status === 'running' || job.status === 'queued') {
          job.status = 'interrupted';
          job.finishedAt = job.finishedAt || new Date().toISOString();
          for (const s of job.scrapers) if (s.status === 'running' || s.status === 'queued') { s.status = 'failed'; s.error = 'the worker was restarted during this crawl'; }
          this.jobs.set(id, job);
          this.#save(job, true);
        } else this.jobs.set(id, job);
      } catch { /* a half-written folder - ignore it */ }
    }
  }

  #save(job, immediate = false) {
    const write = () => {
      const d = path.join(this.dir, job.id);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'job.json'), JSON.stringify(job));
      if (this.rows.has(job.id)) fs.writeFileSync(path.join(d, 'rows.json'), JSON.stringify(this.rows.get(job.id)));
    };
    if (immediate) return write();
    clearTimeout(this.saveTimers.get(job.id));
    const timer = setTimeout(write, 400);
    timer.unref?.();
    this.saveTimers.set(job.id, timer);
  }

  #prune() {
    const ids = [...this.jobs.values()].filter((j) => j.id !== this.currentId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((j) => j.id);
    for (const id of ids.slice(this.config.keepJobs)) {
      this.jobs.delete(id);
      this.rows.delete(id);
      fs.rmSync(path.join(this.dir, id), { recursive: true, force: true });
    }
  }

  /** The job as the outside world sees it (no rows - they're fetched separately). */
  view(job) {
    const c = { ok: 0, zero: 0, failed: 0, running: 0, queued: 0, cancelled: 0 };
    let rows = 0;
    for (const s of job.scrapers) {
      rows += s.rows || 0;
      if (s.status === 'ok') c.ok++; else if (s.status === 'zero') c.zero++; else if (s.status === 'running') c.running++; else if (s.status === 'queued') c.queued++; else if (s.status === 'cancelled') c.cancelled++; else c.failed++;
    }
    return { ...job, counts: c, totalRows: rows, total: job.scrapers.length, finished: c.ok + c.zero + c.failed + c.cancelled };
  }

  get(id) { return this.jobs.get(id) || null; }
  getRows(id) { if (this.rows.has(id)) return this.rows.get(id); try { return JSON.parse(fs.readFileSync(path.join(this.dir, id, 'rows.json'), 'utf8')); } catch { return null; } }
  list() { return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((j) => this.view(j)); }
  get current() { return this.currentId ? this.jobs.get(this.currentId) : null; }

  /** Starts a crawl of the given scraper ids. Throws {code:'busy'} if one is already running. */
  start({ scraperIds, requestedBy }) {
    if (this.currentId) throw Object.assign(new Error('a crawl is already running'), { code: 'busy', currentJobId: this.currentId });
    const registry = this.getRegistry();
    const bySid = new Map();
    for (const v of registry.venues) for (const s of v.scrapers) bySid.set(s.id, { ...s, venueId: v.id });
    const scrapers = [];
    for (const sid of [...new Set(scraperIds)]) {
      const s = bySid.get(sid);
      scrapers.push({ id: sid, file: s.file, fn: s.fn, venueId: s.venueId, crawler: s.crawler, status: 'queued', rows: 0, ms: null, error: null, startedAt: null, logs: [] });
    }
    const job = {
      id: `${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex')}`,
      status: 'running', createdAt: new Date().toISOString(), startedAt: new Date().toISOString(), finishedAt: null,
      requestedBy: requestedBy || null, cancelRequested: false, scrapers,
    };
    this.jobs.set(job.id, job);
    this.rows.set(job.id, []);
    this.currentId = job.id;
    this.#save(job, true);
    this.#run(job).catch((e) => { job.status = 'failed'; job.error = String(e.message || e); this.#finish(job); });
    return job;
  }

  cancel(id) {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'running') return false;
    job.cancelRequested = true;
    if (this.child) {
      this.child.kill('SIGTERM');
      const c = this.child;
      setTimeout(() => { try { c.kill('SIGKILL'); } catch { /* already gone */ } }, 5000).unref();
    }
    return true;
  }

  async #run(job) {
    const files = [...new Set(job.scrapers.map((s) => s.file))].sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
    for (const file of files) {
      if (job.cancelRequested) break;
      await this.#runChild(job, file, job.scrapers.filter((s) => s.file === file));
    }
    this.#finish(job);
  }

  #finish(job) {
    for (const s of job.scrapers) if (s.status === 'running' || s.status === 'queued') { s.status = 'cancelled'; s.error = s.error || 'cancelled'; }
    const v = this.view(job);
    job.status = job.cancelRequested ? 'cancelled' : v.counts.ok + v.counts.zero === 0 && v.total > 0 ? 'failed' : 'done';
    job.finishedAt = new Date().toISOString();
    this.currentId = null;
    this.child = null;
    clearTimeout(this.saveTimers.get(job.id));
    this.saveTimers.delete(job.id);
    this.#save(job, true);
    this.#prune();
  }

  #runChild(job, file, scrapers) {
    const cfg = this.config;
    return new Promise((resolve) => {
      const byFn = new Map(scrapers.map((s) => [s.fn, s]));
      const args = { file: path.join(this.crawlersDir, file), cacheDir: this.cacheDir, scrapers: scrapers.map((s) => s.fn), concurrency: cfg.concurrency, headless: cfg.headless, timeoutMs: cfg.scraperTimeoutMin * 60000, minFreeMb: cfg.minFreeMb };
      const child = spawn(process.execPath, [path.join(__dirname, 'child.js')], { env: { ...process.env, WORKER_CHILD_ARGS: JSON.stringify(args) }, stdio: ['ignore', 'pipe', 'pipe'] });
      this.child = child;
      let stderr = '';
      const killer = setTimeout(() => { job.error = `${file} did not finish within ${cfg.jobTimeoutMin} minutes and was stopped`; child.kill('SIGKILL'); }, cfg.jobTimeoutMin * 60000);
      killer.unref?.();
      const note = (s, line) => { s.logs.push(line); if (s.logs.length > LOG_KEEP) s.logs.shift(); };

      readline.createInterface({ input: child.stdout }).on('line', (line) => {
        let e;
        try { e = JSON.parse(line); } catch { return; }
        const s = e.scraper ? byFn.get(e.scraper) : null;
        if (e.type === 'start' && s) { s.status = 'running'; s.startedAt = new Date().toISOString(); }
        else if (e.type === 'log') { if (s) note(s, e.line); else (job.logs ||= []).push(e.line); }
        else if (e.type === 'done' && s) {
          s.rows = e.rows.length; s.ms = e.ms; s.status = e.rows.length ? 'ok' : 'zero';
          this.rows.get(job.id).push(...e.rows.map((r) => ({ scraper: s.id, ...r })));
        } else if (e.type === 'error' && s) { s.status = e.timeout ? 'timeout' : 'failed'; s.error = e.error; s.ms = e.ms; }
        else if (e.type === 'fatal') job.error = `${file}: ${e.error}`;
        this.#save(job);
      });
      child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-1500); });
      child.on('close', (code) => {
        clearTimeout(killer);
        for (const s of scrapers) {
          if (s.status === 'running' || s.status === 'queued') {
            if (job.cancelRequested) { s.status = 'cancelled'; s.error = 'cancelled'; }
            else { s.status = 'failed'; s.error = `stopped unexpectedly (exit code ${code})${stderr ? ': ' + stderr.trim().split('\n').pop().slice(0, 160) : ''}`; }
          }
        }
        this.#save(job, true);
        resolve();
      });
      child.on('error', (err) => { job.error = `could not start: ${err.message}`; });
    });
  }
}

module.exports = { JobManager };
