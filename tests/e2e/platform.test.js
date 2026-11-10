const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { devices } = require('playwright');
const H = require('./helpers');

let server, browser, base;
test.before(async () => { server = await H.startServer(); browser = await H.launch(); base = `http://127.0.0.1:${server.port}/`; });
test.after(async () => { await browser.close(); await server.close(); });

test('Lokale Einzeldatei (file://): startet, speichert dauerhaft, keine CSP-Verstöße', async (t) => {
  const file = 'file://' + path.join(H.ROOT, 'dist', 'Wiedervorlage_lokal.html');
  const A = await H.newPersistentPage(null, { url: file });
  t.after(() => A.ctx.close().catch(() => {}));
  await H.quickAdd(A.page, 'Doku nachtragen');
  await A.page.reload(); await A.page.waitForSelector('html[data-ready="1"]');
  assert.equal(await A.page.locator('.task .title:text-is("Doku nachtragen")').count(), 1);
  assert.equal(await A.page.evaluate(() => Array.from(WV.state.tasks.values())[0].v.type), 'doku');
  const crypto = await A.page.evaluate(() => !!(window.crypto && window.crypto.subtle) && window.isSecureContext);
  assert.equal(crypto, true);
  const bad = A.log.filter((l) => /Content Security Policy|pageerror|Refused/i.test(l));
  assert.deepEqual(bad, []);
  assert.match(await A.page.textContent('#footVersion'), /lokale Datei/);
});

test('Gehostete Fassung: Service Worker, Offline-Start, keine CSP-Verstöße', async (t) => {
  const A = await H.newPersistentPage(base);
  t.after(() => A.ctx.close().catch(() => {}));
  await A.page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true), null, { timeout: 15000 });
  await A.page.evaluate(() => navigator.serviceWorker.ready);
  await H.quickAdd(A.page, 'Offline-Test vorbereiten');
  await A.ctx.setOffline(true);
  await A.page.reload(); await A.page.waitForSelector('html[data-ready="1"]', { timeout: 15000 });
  assert.equal(await A.page.locator('.task .title:text-is("Offline-Test vorbereiten")').count(), 1);
  await H.quickAdd(A.page, 'Offline angelegt');
  assert.equal(await A.page.locator('.task').count(), 2);
  await A.ctx.setOffline(false);
  const bad = A.log.filter((l) => /Content Security Policy|pageerror|Refused/i.test(l));
  assert.deepEqual(bad, []);
});

test('iPhone-13-Darstellung (simuliert, kein echtes Safari): bedienbar, kein waagerechtes Scrollen', async () => {
  const ctx = await browser.newContext(Object.assign({}, devices['iPhone 13'], { locale: 'de-DE', timezoneId: 'Europe/Berlin' }));
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(H.NOW));
  await page.goto(base); await page.waitForSelector('html[data-ready="1"]');
  // Kein Autofokus auf Touch-Geräten (Tastatur würde aufspringen)
  assert.notEqual(await page.evaluate(() => document.activeElement.id), 'qTitle');
  await page.tap('#qTitle');
  await page.keyboard.type('Rückruf Angehörige');
  await page.tap('#qRecallPicks [data-val="1d"]');
  await page.tap('#qSave');
  await page.waitForSelector('.task');
  await H.seed(page, [{ title: 'Labor kontrollieren', patient: 'Beispiel, K.', recall: '2026-11-09', deadline: '2026-11-11' }]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, 'waagerechtes Scrollen: ' + overflow);
  // Touch-Ziele mindestens 36 px hoch
  const small = await page.evaluate(() => Array.from(document.querySelectorAll('.task .act, .done-btn, #qSave, .seg-btn, .toggle, .chip'))
    .filter((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.height < 36; }).map((e) => e.className + ' ' + e.getBoundingClientRect().height));
  assert.deepEqual(small, []);
  // Eingabefelder ≥ 16 px (verhindert automatisches Zoomen in Safari)
  const fs = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('qTitle')).fontSize));
  assert.ok(fs >= 16);
  await page.tap('.task[aria-label^="Labor"] [data-act="pp-w"]');
  await page.waitForFunction(() => Array.from(WV.state.tasks.values()).find((t) => t.v.title === 'Labor kontrollieren').v.recall === '2026-11-17');
  await ctx.close();
});

test('Leistung mit 1.000 Aufgaben (davon 600 erledigt)', async () => {
  const { ctx, page } = await H.newPage(browser, base);
  const seedMs = await page.evaluate(async () => {
    const t0 = performance.now();
    const M = WV.model, D = WV.dates;
    await WV.db.mutate({}, (cur, ctx) => {
      const out = { tasks: [], patients: [] };
      const pats = [];
      for (let i = 0; i < 120; i++) { const p = M.newPatient('Testperson' + i + ', ' + String.fromCharCode(65 + (i % 26)) + '.', ctx); pats.push(p); out.patients.push(p); }
      for (let i = 0; i < 1000; i++) {
        const recall = D.addDays('2026-11-10', (i % 90) - 30);
        let t = M.newTask({ title: 'Fiktive Aufgabe ' + i + (i % 3 ? ' Labor' : ' Brief'), type: M.TYPES[i % M.TYPES.length].id, recall: recall,
          deadline: i % 7 === 0 ? D.addDays('2026-11-10', (i % 11) - 3) : null, important: i % 13 === 0, patientId: i % 4 ? pats[i % 120].id : null }, ctx);
        if (i < 600) t = M.write(t, { status: 'done', doneAt: ctx.t }, ctx);
        out.tasks.push(t);
      }
      return out;
    });
    return performance.now() - t0;
  });
  const t0 = Date.now();
  await page.reload(); await page.waitForSelector('html[data-ready="1"]');
  const loadMs = Date.now() - t0;
  const renderMs = await page.evaluate(() => { const t = performance.now(); WV.ui.render(); return performance.now() - t; });
  const searchMs = await page.evaluate(() => { const t = performance.now(); WV.state.ui.search = 'labor'; WV.ui.render(); const r = performance.now() - t; WV.state.ui.search = ''; WV.ui.render(); return r; });
  const t1 = Date.now();
  await page.click('.sec-today .task >> nth=0 >> [data-act="pp-w"]');
  await page.waitForSelector('.toast:has-text("Verschoben")');
  const actionMs = Date.now() - t1;
  const counts = await H.counters(page);
  console.log(`  Leistung: Anlegen 1.000 = ${seedMs.toFixed(0)} ms · Neustart bis bedienbar = ${loadMs} ms · Neuaufbau Liste = ${renderMs.toFixed(0)} ms · Suche = ${searchMs.toFixed(0)} ms · Verschieben inkl. Speichern = ${actionMs} ms · Zähler ${counts.join('/')}`);
  assert.equal(counts[2], 400);
  assert.ok(renderMs < 400, 'Liste zu langsam: ' + renderMs);
  assert.ok(searchMs < 400, 'Suche zu langsam: ' + searchMs);
  assert.ok(loadMs < 4000, 'Start zu langsam: ' + loadMs);
  await ctx.close();
});
