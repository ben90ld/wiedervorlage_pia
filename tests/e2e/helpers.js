// Gemeinsame Hilfen für Browser-Tests (Playwright, Chromium)
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'app');
const SHOTS = process.env.WV_SHOTS || path.join(ROOT, 'docs', 'screenshots');
const NOW = '2026-11-10T09:15:00+01:00';

async function startServer() {
  const { serve } = await import(path.join(ROOT, 'tools', 'serve.mjs'));
  return serve(APP);
}

async function launch() {
  return chromium.launch({ args: ['--lang=de-DE'] });
}

// Neuer, leerer Browser-Kontext (entspricht einem frischen Browserprofil)
async function newPage(browser, base, opts = {}) {
  const ctx = await browser.newContext(Object.assign({
    viewport: { width: 1280, height: 860 }, locale: 'de-DE', timezoneId: 'Europe/Berlin', acceptDownloads: true
  }, opts.context || {}));
  const page = await ctx.newPage();
  const log = [];
  page.on('pageerror', (e) => log.push('pageerror: ' + e.message));
  page.on('console', (m) => log.push(m.type() + ': ' + m.text()));
  if (opts.now !== false) await page.clock.setFixedTime(new Date(opts.now || NOW));
  if (opts.init) await page.addInitScript(opts.init);
  await page.goto(opts.url || base);
  await page.waitForSelector('html[data-ready="1"]');
  return { ctx, page, log };
}

// Normales (dauerhaftes) Browserprofil wie bei der echten Nutzung – nötig für gespeicherte Ordnerzugriffe
async function newPersistentPage(base, opts = {}) {
  const fs = require('fs');
  const os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wv-profile-'));
  const ctx = await chromium.launchPersistentContext(dir, Object.assign({
    args: ['--lang=de-DE'], viewport: { width: 1280, height: 860 }, locale: 'de-DE', timezoneId: 'Europe/Berlin', acceptDownloads: true
  }, opts.context || {}));
  const page = ctx.pages()[0] || await ctx.newPage();
  const log = [];
  page.on('pageerror', (e) => log.push('pageerror: ' + e.message));
  page.on('console', (m) => log.push(m.type() + ': ' + m.text()));
  if (opts.now !== false) await page.clock.setFixedTime(new Date(opts.now || NOW));
  if (opts.init) await page.addInitScript(opts.init);
  await page.goto(opts.url || base);
  await page.waitForSelector('html[data-ready="1"]');
  return { ctx, page, log, dir };
}

async function quickAdd(page, title, o = {}) {
  await page.fill('#qTitle', title);
  if (o.patient) {
    await page.fill('#qPatient', o.patient);
    if (o.patientPick != null) {
      for (let i = 0; i < o.patientPick; i++) await page.press('#qPatient', 'ArrowDown');
    }
  }
  if (o.recall) await page.click(`#qRecallPicks [data-val="${o.recall}"]`);
  if (o.deadline) await page.fill('#qDeadline', o.deadline);
  if (o.important) await page.click('#qImportant');
  if (o.type) await page.click(`#qTypes [data-type="${o.type}"]`);
  await page.press(o.patient ? '#qPatient' : '#qTitle', 'Enter');
  await page.waitForFunction((t) => document.getElementById('qTitle').value === '' &&
    Array.from(document.querySelectorAll('.task .title')).some((e) => e.textContent === t), title);
}

// Legt Aufgaben direkt über die App-Funktionen an (für Testdaten mit beliebigen Daten)
async function seed(page, tasks) {
  await page.evaluate(async (list) => {
    for (const t of list) {
      await WV.actions.create({
        title: t.title, type: t.type || WV.model.detectType(t.title), typeAuto: !t.type,
        patient: t.patient ? (t.patientId ? { id: t.patientId } : { newLabel: t.patient }) : null,
        recall: t.recall, deadline: t.deadline || null, important: !!t.important, note: t.note || null
      });
    }
    WV.ui.render();
  }, tasks);
}

async function counters(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('#counters .counter')).map((c) => c.querySelector('.c-n').textContent).map(Number));
}

async function sectionTitles(page, cls) {
  return page.evaluate((c) => Array.from(document.querySelectorAll('.sec-' + c + ' .task .title')).map((e) => e.textContent), cls);
}

module.exports = { ROOT, APP, SHOTS, NOW, startServer, launch, newPage, newPersistentPage, quickAdd, seed, counters, sectionTitles };
