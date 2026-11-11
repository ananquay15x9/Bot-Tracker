// lib/loader.js
//
// Finds the scrapers in a crawler file and makes the file loadable WITHOUT editing it.
//
// Your crawler files end with a block that runs everything and writes calendar-N.csv. That is right when you
// run `node crawler-N.js` yourself, but the worker needs to call individual scrapers instead. So when a file
// doesn't already export its scrapers, a tiny wrapped copy is made in .cache/: the run-everything block is
// switched to "only when run directly", and the scraper functions are exported. Your original file is never
// touched, so you can keep editing and testing it in VS Code and just copy the new version over.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const SCRAPER_RE = /^async function (scrape\w+)\(browser\)/gm; // the scrapers: scrapeSomething(browser)

function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

/** What's in a crawler file, without running it. */
function inspectFile(file) {
  const out = { file: path.basename(file), ok: true, error: null, scrapers: [] };
  let text;
  try {
    text = readText(file);
  } catch (e) {
    return { ...out, ok: false, error: `can't read the file: ${e.message}` };
  }
  try {
    new vm.Script(text, { filename: path.basename(file) }); // compiles only - nothing runs
  } catch (e) {
    return { ...out, ok: false, error: `syntax error: ${e.message}` };
  }
  out.scrapers = [...new Set([...text.matchAll(SCRAPER_RE)].map((m) => m[1]))];
  out.hasExports = /module\.exports\s*=/.test(text);
  if (out.scrapers.length === 0) return { ...out, ok: false, error: 'no scrapeSomething(browser) functions found' };
  return out;
}

/** The path to require() for this file: itself if it already exports its scrapers, else a wrapped copy. */
function prepare(file, cacheDir) {
  const text = readText(file);
  if (/module\.exports\s*=/.test(text)) return file;
  fs.mkdirSync(cacheDir, { recursive: true });
  const stat = fs.statSync(file);
  const key = crypto.createHash('sha1').update(`${path.basename(file)}|${stat.size}|${stat.mtimeMs}`).digest('hex').slice(0, 10);
  const out = path.join(cacheDir, `${path.basename(file, '.js')}.${key}.js`);
  if (fs.existsSync(out)) return out;

  let wrapped = text;
  const at = wrapped.lastIndexOf('\n(async () => {');
  if (at >= 0) wrapped = wrapped.slice(0, at + 1) + 'if (require.main === module) ' + wrapped.slice(at + 1);
  const names = [...new Set([...wrapped.matchAll(SCRAPER_RE)].map((m) => m[1]))];
  wrapped += `\n\nmodule.exports = { ${names.join(', ')} };\n`;
  fs.writeFileSync(out, wrapped, 'utf8');
  return out;
}

module.exports = { inspectFile, prepare };
