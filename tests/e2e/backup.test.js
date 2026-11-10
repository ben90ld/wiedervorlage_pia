const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const H = require('./helpers');

const PASS = 'Kompass Ahorn Tinte Wolke Fahrrad';
let server, browser, base, tmp;
test.before(async () => {
  server = await H.startServer(); browser = await H.launch(); base = `http://127.0.0.1:${server.port}/`;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wv-backup-'));
});
test.after(async () => { await browser.close(); await server.close(); });

// Ordnerauswahl über das private Dateisystem des Browsers (OPFS) nachbilden – gleiche Schnittstelle wie ein echter Ordner
const OPFS_PICKER = () => {
  window.showDirectoryPicker = async () => {
    const r = await navigator.storage.getDirectory();
    return r.getDirectoryHandle('Wiedervorlage-Sicherung', { create: true });
  };
};

async function setPassphrase(page, pass = PASS) {
  await page.click('#backupPill');
  await page.waitForSelector('#dlgPass[open]');
  await page.fill('#pass1', pass);
  await page.fill('#pass2', pass);
  await page.check('#passAck');
  await page.click('#dlgPass .btn.primary');
  await page.waitForFunction(() => !document.getElementById('dlgPass').open && !!WV.backupCtl.key, null, { timeout: 20000 });
}

async function downloadBackup(page) {
  await page.click('#btnSettings');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dlgSettings button:has-text("Sicherung herunterladen")')]);
  const file = path.join(tmp, dl.suggestedFilename());
  await dl.saveAs(file);
  await page.keyboard.press('Escape');
  return { file, name: dl.suggestedFilename() };
}

async function importFile(page, file, pass, expect) {
  if (await page.locator('.welcome').count()) await page.click('.welcome button:has-text("Sicherungsdatei laden")');
  else { await page.click('#btnSettings'); await page.click('#dlgSettings button:has-text("Sicherung laden")'); }
  await page.waitForSelector('#dlgImport[open]');
  await page.setInputFiles('#importFile', file);
  if (pass) {
    await page.waitForSelector('#importPass');
    await page.fill('#importPass', pass);
    await page.press('#importPass', 'Enter');
  }
  await page.waitForSelector('#iHead:has-text("Vorschau")', { timeout: 20000 });
  const text = await page.textContent('#dlgImport');
  if (expect) expect(text);
  const btn = page.locator('#dlgImport .dlg-foot .btn.primary');
  await btn.click();
  await page.waitForFunction(() => !document.getElementById('dlgImport').open);
  return text;
}

test('Verschlüsselte Sicherung herunterladen und in leerem Browserprofil vollständig wiederherstellen', async () => {
  const A = await H.newPage(browser, base);
  await H.seed(A.page, [
    { title: 'Arztbrief fertigstellen', patient: 'Musterfrau, E.', recall: '2026-11-10', note: 'Vorbefunde liegen im Postfach' },
    { title: 'Labor kontrollieren', patient: 'Beispiel, K.', recall: '2026-11-14', deadline: '2026-11-12', important: true },
    { title: 'Rezept vorbereiten', recall: '2026-12-01' }
  ]);
  assert.match(await A.page.textContent('#backupPill'), /Sicherung einrichten/);
  await setPassphrase(A.page);
  const { file, name } = await downloadBackup(A.page);
  assert.match(name, /^Wiedervorlage_2026-11-10_09-15\.json$/);
  const raw = fs.readFileSync(file, 'utf8');
  for (const s of ['Arztbrief', 'Musterfrau', 'Beispiel', 'Vorbefunde', 'Rezept']) assert.ok(!raw.includes(s), 'Klartext in Sicherung: ' + s);
  const header = JSON.parse(raw);
  assert.equal(header.format, 'wiedervorlage-backup');
  assert.equal(header.key.kdf.iterations, 600000);
  assert.match(await A.page.textContent('#backupPill'), /Gesichert/);

  // Frisches Profil (z. B. nach Löschen des Chrome-Profils)
  const B = await H.newPage(browser, base);
  assert.equal(await B.page.locator('.welcome').count(), 1);
  // falsche Passphrase
  await B.page.click('.welcome button:has-text("Sicherungsdatei laden")');
  await B.page.setInputFiles('#importFile', file);
  await B.page.fill('#importPass', 'falsch falsch falsch');
  await B.page.press('#importPass', 'Enter');
  await B.page.waitForSelector('#dlgImport .hint-line.warn:has-text("Passphrase falsch")', { timeout: 20000 });
  await B.page.keyboard.press('Escape');
  await importFile(B.page, file, PASS, (t) => {
    assert.match(t, /Neue Aufgaben\s*3/);
    assert.match(t, /Notizen übernommen\s*1/);
  });
  const st = await B.page.evaluate(() => {
    const tasks = Array.from(WV.state.tasks.values());
    const a = tasks.find((t) => t.v.title === 'Arztbrief fertigstellen');
    return { n: tasks.length, note: WV.state.local.get(a.id).note, pat: WV.state.view.display[a.v.patientId], key: WV.backupCtl.keyInfo && WV.backupCtl.keyInfo.keyId };
  });
  assert.equal(st.n, 3);
  assert.equal(st.note, 'Vorbefunde liegen im Postfach');
  assert.equal(st.pat, 'Musterfrau, E.');
  assert.equal(st.key, header.key.keyId); // Schlüssel übernommen → künftige Sicherungen mit derselben Passphrase
  assert.deepEqual(await H.counters(B.page), [0, 1, 3]);

  // Erneuter Import einer älteren Sicherung überschreibt neuere Änderungen nicht
  await B.page.click('.task[aria-label^="Rezept"] .title');
  await B.page.fill('#eTitle', 'Rezept vorbereiten (geändert)');
  await B.page.keyboard.press('Escape');
  await B.page.waitForFunction(() => Array.from(WV.state.tasks.values()).some((t) => t.v.title === 'Rezept vorbereiten (geändert)'));
  await importFile(B.page, file, null, (t) => {
    assert.match(t, /Neue Aufgaben\s*0/);
    assert.match(t, /Aktualisierte Aufgaben\s*0/);
    assert.match(t, /nichts, was hier nicht bereits vorhanden oder neuer ist/);
  });
  assert.equal(await B.page.locator('.task .title:text-is("Rezept vorbereiten (geändert)")').count(), 1);

  // Rückweg: Sicherung von B (mit neuer Aufgabe) in A zusammenführen
  await H.quickAdd(B.page, 'Bescheinigung erstellen');
  const fromB = await downloadBackup(B.page);
  await importFile(A.page, fromB.file, null, (t) => {
    assert.match(t, /Neue Aufgaben\s*1/);
    assert.match(t, /Aktualisierte Aufgaben\s*1/);
    assert.match(t, /mit dem Schlüssel dieses Geräts geöffnet/);
  });
  assert.equal(await A.page.locator('.task').count(), 4);
  await A.ctx.close(); await B.ctx.close();
});

test('Gleichzeitige Änderungen auf zwei Profilen → Konflikt wird angezeigt und lässt sich klären', async () => {
  const A = await H.newPage(browser, base);
  await H.seed(A.page, [{ title: 'Rückruf Praxis', recall: '2026-11-20' }]);
  await setPassphrase(A.page);
  const first = await downloadBackup(A.page);
  const B = await H.newPage(browser, base, { now: '2026-11-10T10:00:00+01:00' });
  await importFile(B.page, first.file, PASS);
  // A ändert offline, B erledigt gleichzeitig
  await A.page.click('.task .title');
  await A.page.fill('#eTitle', 'Rückruf Praxis wegen Termin');
  await A.page.keyboard.press('Escape');
  await A.page.waitForFunction(() => Array.from(WV.state.tasks.values())[0].v.title === 'Rückruf Praxis wegen Termin');
  await B.page.click('.task [data-act="done"]');
  await B.page.waitForFunction(() => Array.from(WV.state.tasks.values())[0].v.status === 'done');
  const fromB = await downloadBackup(B.page);
  await importFile(A.page, fromB.file, null, (t) => assert.match(t, /Konflikte zur Prüfung\s*1/));
  // Aufgabe bleibt sichtbar unter "Heute & überfällig" mit Konflikthinweis
  await A.page.waitForSelector('.sec-today .task .b-conflict');
  await A.page.click('.sec-today .task .title');
  assert.match(await A.page.textContent('#eConflicts'), /auf einem anderen Gerät erledigt/);
  await A.page.click('#eConflicts button:has-text("Wieder öffnen")');
  await A.page.waitForFunction(() => { const t = Array.from(WV.state.tasks.values())[0]; return t.v.status === 'open' && WV.model.openConflicts(t).length === 0; });
  await A.page.keyboard.press('Escape');
  assert.equal(await A.page.locator('.b-conflict').count(), 0);
  await A.ctx.close(); await B.ctx.close();
});

test('Automatische Ordner-Sicherung: schreiben, prüfen, datierte Kopie, nach Änderung aktualisieren', async (t) => {
  const A = await H.newPersistentPage(base, { init: OPFS_PICKER });
  t.after(() => A.ctx.close().catch(() => {}));
  await H.seed(A.page, [{ title: 'Antrag bearbeiten', recall: '2026-11-11' }]);
  await setPassphrase(A.page);
  await A.page.click('#btnSettings');
  await A.page.click('#dlgSettings button:has-text("Sicherungsordner wählen")');
  await A.page.waitForSelector('.toast:has-text("Sicherung geschrieben und geprüft")', { timeout: 20000 });
  await A.page.keyboard.press('Escape');
  const files = () => A.page.evaluate(async () => {
    const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('Wiedervorlage-Sicherung');
    const out = [];
    for await (const [n] of d.entries()) out.push(n);
    return out.sort();
  });
  assert.deepEqual(await files(), ['Wiedervorlage_2026-11-10_09-15.json', 'Wiedervorlage_aktuell.json']);
  assert.match(await A.page.textContent('#backupPill'), /Gesichert 09:15/);
  // Änderung → automatische Sicherung (Verzögerung für den Test verkürzt)
  await A.page.evaluate(() => { WV.backup.AUTO_DELAY = 200; });
  await H.quickAdd(A.page, 'Mail beantworten');
  await A.page.waitForFunction(() => !WV.backupCtl.dirty() && !WV.backupCtl.busy, null, { timeout: 20000 });
  const count = await A.page.evaluate(async () => {
    const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('Wiedervorlage-Sicherung');
    const f = await (await d.getFileHandle('Wiedervorlage_aktuell.json')).getFile();
    const opened = await WV.backup.openFile(await f.text());
    return opened.payload.tasks.length;
  });
  assert.equal(count, 2);
  // Nur eine datierte Kopie pro Tag
  assert.equal((await files()).length, 2);
  // Ordner bleibt nach Neustart verbunden
  await A.page.reload(); await A.page.waitForSelector('html[data-ready="1"]');
  assert.equal(await A.page.evaluate(() => !!WV.backupCtl.dir && WV.backupCtl.perm), 'granted');
  // Wiederherstellen aus dem Ordner (Vorschau, nichts Neues)
  await A.page.click('#btnSettings');
  await A.page.click('#dlgSettings button:has-text("Aus Ordner wiederherstellen")');
  await A.page.waitForSelector('#iHead:has-text("Vorschau")', { timeout: 20000 });
  assert.match(await A.page.textContent('#dlgImport'), /Wiedervorlage_aktuell\.json/);
  await A.page.click('#dlgImport .dlg-foot .btn.primary');
  await A.ctx.close();
});

test('Nicht erreichbarer Sicherungsordner: Fehler wird angezeigt, Daten bleiben erhalten', async (t) => {
  const A = await H.newPersistentPage(base, { init: OPFS_PICKER });
  t.after(() => A.ctx.close().catch(() => {}));
  await H.seed(A.page, [{ title: 'Befund anfordern', recall: '2026-11-11' }]);
  await setPassphrase(A.page);
  await A.page.click('#btnSettings');
  await A.page.click('#dlgSettings button:has-text("Sicherungsordner wählen")');
  await A.page.waitForSelector('.toast:has-text("geprüft")', { timeout: 20000 });
  await A.page.keyboard.press('Escape');
  // Ordner verschwindet (z. B. Netzlaufwerk getrennt)
  await A.page.evaluate(async () => { await (await navigator.storage.getDirectory()).removeEntry('Wiedervorlage-Sicherung', { recursive: true }); });
  await H.quickAdd(A.page, 'Rückruf Angehörige');
  const res = await A.page.evaluate(() => WV.backupCtl.writeNow(true));
  assert.equal(res.ok, false);
  assert.match(res.message, /nicht gefunden|nicht geschrieben/);
  await A.page.waitForFunction(() => document.getElementById('backupPill').textContent.includes('fehlgeschlagen'));
  assert.equal(await A.page.locator('.task').count(), 2);
  await A.page.click('#backupPill');
  assert.match(await A.page.textContent('#dlgSettings'), /Letzter Fehler/);
  await A.ctx.close();
});

test('Hinweis bei ungesicherten Änderungen älter als ein Tag; ungültige Dateien werden abgewiesen', async () => {
  const A = await H.newPage(browser, base);
  await H.seed(A.page, [{ title: 'Formular ausfüllen', recall: '2026-11-11' }]);
  await setPassphrase(A.page);
  await A.page.evaluate(async () => {
    await WV.db.updateMeta('backupState', (bs) => Object.assign(bs || {}, { firstUnbackedAt: '2026-11-08T08:00:00.000Z', lastOkSeq: 0 }));
  });
  await A.page.reload(); await A.page.waitForSelector('html[data-ready="1"]');
  await A.page.waitForSelector('.banner:has-text("Seit mehr als einem Tag")');
  // Ungültige Datei
  const bad = path.join(tmp, 'keine-sicherung.json');
  fs.writeFileSync(bad, JSON.stringify({ hallo: 'welt' }));
  await A.page.click('#btnSettings');
  await A.page.click('#dlgSettings button:has-text("Sicherung laden")');
  await A.page.setInputFiles('#importFile', bad);
  await A.page.waitForSelector('#dlgImport .hint-line.warn:has-text("keine Wiedervorlage-Sicherung")');
  // Sicherung aus neuerer Programmversion
  const newer = path.join(tmp, 'neuer.json');
  const { file } = await downloadBackupFromSettingsClosed(A.page);
  const h = JSON.parse(fs.readFileSync(file, 'utf8')); h.formatVersion = 7;
  fs.writeFileSync(newer, JSON.stringify(h));
  await A.page.click('#btnSettings');
  await A.page.click('#dlgSettings button:has-text("Sicherung laden")');
  await A.page.setInputFiles('#importFile', newer);
  await A.page.waitForSelector('#dlgImport .hint-line.warn:has-text("neueren Programmversion")');
  await A.ctx.close();
});

async function downloadBackupFromSettingsClosed(page) {
  if (await page.locator('dialog[open]').count()) await page.keyboard.press('Escape');
  return downloadBackup(page);
}
