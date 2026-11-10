// Synchronisation zweier Geräte über einen nachgebildeten Google-Drive-App-Ordner
const test = require('node:test');
const assert = require('node:assert/strict');
const { devices } = require('playwright');
const H = require('./helpers');
const { createFakeGoogle } = require('./fakegoogle');
const WVN = require('../unit/load'); // Krypto/Format in Node zum Prüfen der Drive-Dateien

const PASS = 'Kompass Ahorn Tinte Wolke Fahrrad';
const PASS2 = 'Gletscher Laterne Pinsel Hafen Moos';
let server, browser, base, fake;

test.before(async () => {
  server = await H.startServer(); browser = await H.launch(); base = `http://127.0.0.1:${server.port}/`;
  fake = createFakeGoogle();
});
test.after(async () => { await browser.close(); await server.close(); });

async function device(kind, now) {
  const opts = kind === 'iphone' ? Object.assign({}, devices['iPhone 13']) : { viewport: { width: 1280, height: 860 } };
  const ctx = await browser.newContext(Object.assign(opts, { locale: 'de-DE', timezoneId: 'Europe/Berlin', serviceWorkers: 'block' }));
  await fake.attach(ctx);
  const page = await ctx.newPage();
  const log = [];
  page.on('pageerror', (e) => log.push('pageerror: ' + e.message));
  page.on('console', (m) => log.push(m.type() + ': ' + m.text()));
  await page.clock.setFixedTime(new Date(now || H.NOW));
  await page.goto(base); await page.waitForSelector('html[data-ready="1"]');
  return { ctx, page, log };
}
const ready = (page) => page.waitForSelector('html[data-ready="1"]', { timeout: 20000 });
const sync = (page) => page.evaluate(() => WV.ui.syncNow(false));
const titles = (page) => page.evaluate(() => Array.from(WV.state.tasks.values()).filter((t) => !t.v.deleted && !t.v.purged).map((t) => t.v.title).sort());
const task = (page, title) => page.evaluate((x) => { const t = Array.from(WV.state.tasks.values()).find((t) => t.v.title === x); return t ? { v: t.v, conflicts: WV.model.openConflicts(t).length, note: (WV.state.local.get(t.id) || {}).note || null } : null; }, title);

async function decryptDeviceFiles(pass) {
  const out = [];
  for (const f of fake.byName(/^wv-dev-/)) {
    const h = WVN.format.parse(f.content, 'wiedervorlage-sync');
    const key = await WVN.crypto.unlock(h.key, pass);
    out.push({ name: f.name, raw: f.content, payload: (await WVN.format.decrypt(h, key)).payload });
  }
  return out;
}

test('Zwei Geräte: Einrichtung, verschlüsselter Abgleich, lokale Notizen, Konflikte, offline, Anmeldung, Passphrasenwechsel', async (t) => {
  const PC = await device('pc');
  const IP = await device('iphone');
  t.after(async () => { await PC.ctx.close(); await IP.ctx.close(); });

  await t.test('Einrichtung am PC: Anmeldung, Passphrase, verschlüsselte Ablage ohne Notizen', async () => {
    await H.seed(PC.page, [
      { title: 'Arztbrief fertigstellen', patient: 'Musterfrau, E.', recall: '2026-11-10', note: 'Vorbefunde im Postfach' },
      { title: 'Labor kontrollieren', recall: '2026-11-12', deadline: '2026-11-20' }
    ]);
    await PC.page.click('#btnSettings');
    await PC.page.click('#btnSyncSetup');
    await ready(PC.page);
    await PC.page.waitForSelector('#dlgPass[open]');
    assert.match(await PC.page.textContent('#pHead'), /Synchronisation/);
    await PC.page.fill('#pass1', PASS); await PC.page.fill('#pass2', PASS); await PC.page.check('#passAck');
    await PC.page.click('#dlgPass .btn.primary');
    await PC.page.waitForFunction(() => WV.sync.cfg().lastSyncAt && !WV.sync.st.running, null, { timeout: 20000 });
    assert.match(await PC.page.textContent('#syncPill'), /Synchronisiert/);
    assert.deepEqual(fake.authRequests.map((a) => [a.prompt, a.scope]), [['select_account', 'https://www.googleapis.com/auth/drive.appdata']]);
    assert.equal(fake.byName(/^wv-keys\.json$/).length, 1);
    const files = await decryptDeviceFiles(PASS);
    assert.equal(files.length, 1);
    assert.equal(files[0].payload.tasks.length, 2);
    // Kein Klartext und keine Notizen in Google Drive
    for (const f of fake.files.values()) for (const s of ['Arztbrief', 'Musterfrau', 'Labor', 'Vorbefunde']) assert.ok(!f.content.includes(s), s + ' im Klartext in ' + f.name);
    assert.ok(!JSON.stringify(files[0].payload).includes('Vorbefunde'));
    assert.equal(files[0].payload.local.length, 0);
    // Token nicht in der Adresszeile
    assert.equal(new URL(PC.page.url()).hash, '');
  });

  await t.test('Einrichtung am iPhone: Passphrase eingeben, Daten erscheinen, Notizfeld ausgeblendet', async () => {
    await IP.page.tap('#btnSettings');
    await IP.page.tap('#btnSyncSetup');
    await ready(IP.page);
    await IP.page.waitForSelector('#dlgPass[open] #unlockPass');
    await IP.page.fill('#unlockPass', 'falsche Passphrase hier');
    await IP.page.press('#unlockPass', 'Enter');
    await IP.page.waitForSelector('#dlgPass .hint-line.warn:has-text("Passphrase falsch")', { timeout: 20000 });
    await IP.page.fill('#unlockPass', PASS);
    await IP.page.press('#unlockPass', 'Enter');
    await IP.page.waitForFunction(() => WV.state.tasks.size === 2, null, { timeout: 20000 });
    assert.deepEqual(await titles(IP.page), ['Arztbrief fertigstellen', 'Labor kontrollieren']);
    assert.equal(await IP.page.locator('.task .pat:text-is("Musterfrau, E.")').count(), 1);
    assert.equal((await task(IP.page, 'Arztbrief fertigstellen')).note, null);
    await IP.page.tap('.task[aria-label^="Arztbrief"] .title');
    assert.equal(await IP.page.isVisible('#eNote'), false);
    assert.equal(await IP.page.isVisible('#eNoteHidden'), true);
    await IP.page.keyboard.press('Escape');
    assert.equal(fake.byName(/^wv-dev-/).length, 2);
  });

  await t.test('Änderungen in beide Richtungen; Notiz am PC bleibt erhalten; Löschmarker', async () => {
    await IP.page.tap('.task[aria-label^="Arztbrief"] [data-act="pp-w"]');
    await IP.page.waitForFunction(() => Array.from(WV.state.tasks.values()).find((t) => t.v.title === 'Arztbrief fertigstellen').v.recall === '2026-11-17');
    await H.quickAdd(IP.page, 'Rückruf Angehörige');
    await sync(IP.page);
    await sync(PC.page);
    const a = await task(PC.page, 'Arztbrief fertigstellen');
    assert.equal(a.v.recall, '2026-11-17');
    assert.equal(a.note, 'Vorbefunde im Postfach');
    assert.deepEqual(await titles(PC.page), ['Arztbrief fertigstellen', 'Labor kontrollieren', 'Rückruf Angehörige']);
    // Löschen am PC
    await PC.page.click('.task[aria-label^="Labor"] .title');
    await PC.page.click('#eDelete');
    await PC.page.waitForFunction(() => !document.querySelector('.task[aria-label^="Labor"]'));
    await sync(PC.page);
    await sync(IP.page);
    assert.deepEqual(await titles(IP.page), ['Arztbrief fertigstellen', 'Rückruf Angehörige']);
    await sync(IP.page); await sync(PC.page);
    assert.deepEqual(await titles(PC.page), ['Arztbrief fertigstellen', 'Rückruf Angehörige']);
  });

  await t.test('Gleichzeitige Änderung desselben Titels → Konflikt auf beiden Geräten, Klärung wird übertragen', async () => {
    await PC.page.evaluate(async () => { const t = Array.from(WV.state.tasks.values()).find((x) => x.v.title === 'Rückruf Angehörige'); await WV.actions.update(t.id, { title: 'Rückruf Angehörige (PC)' }); WV.ui.render(); });
    await IP.page.evaluate(async () => { const t = Array.from(WV.state.tasks.values()).find((x) => x.v.title === 'Rückruf Angehörige'); await WV.actions.update(t.id, { title: 'Rückruf Angehörige (iPhone)' }); WV.ui.render(); });
    await sync(PC.page); await sync(IP.page); await sync(PC.page);
    const c1 = await PC.page.evaluate(() => Array.from(WV.state.tasks.values()).filter((t) => WV.model.openConflicts(t).length).length);
    const c2 = await IP.page.evaluate(() => Array.from(WV.state.tasks.values()).filter((t) => WV.model.openConflicts(t).length).length);
    assert.equal(c1, 1); assert.equal(c2, 1);
    assert.match(await PC.page.textContent('#syncPill'), /1 Konflikt prüfen/);
    await PC.page.click('#syncPill');
    await PC.page.waitForSelector('#dlgEdit[open] #eConflicts .conflict-box');
    await PC.page.click('#eConflicts button:has-text("Aktuelle behalten")');
    await PC.page.keyboard.press('Escape');
    await sync(PC.page); await sync(IP.page);
    const left = await IP.page.evaluate(() => Array.from(WV.state.tasks.values()).filter((t) => WV.model.openConflicts(t).length).length);
    assert.equal(left, 0);
  });

  await t.test('Offline am PC: Änderung wartet, wird nach Wiederverbindung übertragen', async () => {
    await PC.ctx.setOffline(true);
    await PC.page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await H.quickAdd(PC.page, 'Bescheinigung offline erstellt');
    await PC.page.waitForFunction(() => /Offline/.test(document.getElementById('syncPill').textContent));
    await PC.ctx.setOffline(false);
    await PC.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await PC.page.waitForFunction(() => !WV.sync.pending() && !WV.sync.st.running, null, { timeout: 20000 });
    await sync(IP.page);
    assert.ok((await titles(IP.page)).includes('Bescheinigung offline erstellt'));
  });

  await t.test('Bearbeitungsfenster offen während fremder Änderung: nichts wird zurückgesetzt', async () => {
    await PC.page.click('.task[aria-label^="Arztbrief"] .title');
    await PC.page.fill('#eNote', 'Vorbefunde im Postfach, Sekretariat informiert');
    await IP.page.evaluate(async () => { const t = Array.from(WV.state.tasks.values()).find((x) => x.v.title === 'Arztbrief fertigstellen'); await WV.actions.update(t.id, { important: true, deadline: '2026-11-25' }); });
    await sync(IP.page);
    await sync(PC.page);
    await PC.page.waitForFunction(() => document.getElementById('eDeadline').value === '2026-11-25');
    assert.equal(await PC.page.getAttribute('#eImportant', 'aria-pressed'), 'true');
    assert.equal(await PC.page.inputValue('#eNote'), 'Vorbefunde im Postfach, Sekretariat informiert');
    await PC.page.keyboard.press('Escape');
    await PC.page.waitForFunction(() => !document.getElementById('dlgEdit').open);
    await PC.page.waitForTimeout(300);
    const a = await task(PC.page, 'Arztbrief fertigstellen');
    assert.equal(a.v.important, true);
    assert.equal(a.v.deadline, '2026-11-25');
    assert.equal(a.note, 'Vorbefunde im Postfach, Sekretariat informiert');
  });

  await t.test('Nichts geändert → kein erneutes Hochladen; gelöschte eigene Datei wird neu angelegt', async () => {
    await sync(PC.page);
    const before = fake.apiCalls.filter((c) => c.startsWith('PATCH')).length;
    await sync(PC.page); await sync(PC.page);
    assert.equal(fake.apiCalls.filter((c) => c.startsWith('PATCH')).length, before);
    const devId = await PC.page.evaluate(() => WV.sync.st.deviceId);
    const own = fake.byName(new RegExp('^wv-dev-' + devId));
    fake.files.delete(own[0].id);
    await sync(PC.page);
    assert.equal(fake.byName(new RegExp('^wv-dev-' + devId)).length, 1);
  });

  await t.test('Abgelaufene Anmeldung: Antippen erneuert still; beim Öffnen automatisch; Schleifenschutz', async () => {
    const n0 = fake.authRequests.length;
    await PC.page.clock.setFixedTime(new Date('2026-11-10T11:30:00+01:00'));
    await PC.page.evaluate(() => WV.ui.renderSyncPill());
    assert.match(await PC.page.textContent('#syncPill'), /verbinden/);
    await PC.page.click('#syncPill');
    await ready(PC.page);
    await PC.page.waitForFunction(() => WV.sync.cfg().lastSyncAt && !WV.sync.st.running && document.getElementById('syncPill').textContent.includes('Synchronisiert'), null, { timeout: 20000 });
    assert.equal(fake.authRequests.length, n0 + 1);
    assert.equal(fake.authRequests[n0].prompt, 'none');
    // Neues Fenster (ohne Token) → automatische stille Anmeldung beim Öffnen
    await PC.page.clock.setFixedTime(new Date('2026-11-10T11:35:00+01:00'));
    const p2 = await PC.ctx.newPage();
    await p2.clock.setFixedTime(new Date('2026-11-10T11:35:00+01:00'));
    await p2.goto(base);
    await p2.waitForFunction(() => window.WV && WV.sync && WV.sync.cfg().lastSyncAt && WV.auth.token(), null, { timeout: 20000 });
    assert.equal(fake.authRequests.length, n0 + 2);
    assert.equal(fake.authRequests[n0 + 1].prompt, 'none');
    await p2.close();
    // Stille Anmeldung scheitert (z. B. Zustimmung nach 7 Tagen) → Hinweis, keine Schleife
    fake.silentFail = 'consent_required';
    const p3 = await PC.ctx.newPage();
    await p3.clock.setFixedTime(new Date('2026-11-10T11:40:00+01:00'));
    await p3.goto(base);
    await p3.waitForSelector('.banner:has-text("Mit Google anmelden")', { timeout: 20000 });
    await p3.waitForTimeout(1500);
    assert.equal(fake.authRequests.length, n0 + 3);
    fake.silentFail = null;
    await p3.click('.banner button:has-text("Mit Google anmelden")');
    await ready(p3);
    await p3.waitForFunction(() => WV.auth.token() && WV.sync.cfg().lastSyncAt, null, { timeout: 20000 });
    assert.equal(fake.authRequests[n0 + 3].prompt, 'select_account');
    await p3.close();
  });

  await t.test('Neue Passphrase am PC → iPhone fragt einmal nach der neuen Passphrase, danach normaler Abgleich', async () => {
    await PC.page.reload(); await ready(PC.page);
    await PC.page.waitForFunction(() => WV.auth.token());
    await PC.page.click('#btnSettings');
    await PC.page.click('#dlgSettings button:has-text("Neue Passphrase festlegen")');
    await PC.page.fill('#pass1', PASS2); await PC.page.fill('#pass2', PASS2); await PC.page.check('#passAck');
    await PC.page.click('#dlgPass .btn.primary');
    await PC.page.waitForFunction(() => !document.getElementById('dlgPass').open);
    await PC.page.keyboard.press('Escape'); // Einstellungen schließen
    await PC.page.waitForFunction(() => !document.querySelector('dialog[open]'));
    await PC.page.waitForFunction(() => !WV.sync.st.running && WV.sync.cfg().keyPendingUpload === false && !WV.sync.pending(), null, { timeout: 20000 });
    await H.quickAdd(PC.page, 'Nach Passphrasenwechsel angelegt');
    await sync(PC.page);
    await IP.page.evaluate(() => WV.ui.syncNow(false));
    await IP.page.waitForSelector('#dlgPass[open] #unlockPass', { timeout: 20000 });
    await IP.page.fill('#unlockPass', PASS2);
    await IP.page.press('#unlockPass', 'Enter');
    await IP.page.waitForFunction(() => Array.from(WV.state.tasks.values()).some((t) => t.v.title === 'Nach Passphrasenwechsel angelegt'), null, { timeout: 20000 });
    // Alle Gerätedateien jetzt mit neuem Schlüssel lesbar
    await sync(IP.page);
    const files = await decryptDeviceFiles(PASS2);
    assert.equal(files.length, 2);
  });

  const errs = PC.log.concat(IP.log).filter((l) => /pageerror|Content Security|Refused/.test(l));
  assert.deepEqual(errs, []);
  // Keine Inhalte und keine Tokens in Konsolenausgaben
  assert.equal(PC.log.concat(IP.log).filter((l) => /Arztbrief|tok-\d/.test(l)).length, 0);
});
