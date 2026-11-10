const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

let server, browser, base;
test.before(async () => { server = await H.startServer(); browser = await H.launch(); base = `http://127.0.0.1:${server.port}/`; });
test.after(async () => { await browser.close(); await server.close(); });

test('Schnelleingabe: Enter speichert, Feld wird geleert, Cursor bleibt, Art erkannt, Wiedervorlage +7', async () => {
  const { ctx, page, log } = await H.newPage(browser, base);
  await page.fill('#qTitle', 'Rezept vorbereiten');
  assert.equal(await page.getAttribute('#qTypes [data-type="rezept"]', 'aria-checked'), 'true');
  await page.press('#qTitle', 'Enter');
  await page.waitForSelector('.task');
  assert.equal(await page.inputValue('#qTitle'), '');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'qTitle');
  const rec = await page.evaluate(() => Array.from(WV.state.tasks.values())[0].v);
  assert.equal(rec.recall, '2026-11-17');
  assert.equal(rec.type, 'rezept');
  assert.equal(rec.typeAuto, true);
  assert.equal(rec.status, 'open');
  assert.equal(rec.important, false);
  assert.equal(rec.deadline, null);
  // Weitere Aufgabe sofort danach möglich
  await page.keyboard.type('Rückruf durchführen');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.task').length === 2);
  assert.deepEqual(await H.sectionTitles(page, 'week'), ['Rezept vorbereiten', 'Rückruf durchführen']);
  // Gespeichert über Neuladen hinweg
  await page.reload(); await page.waitForSelector('html[data-ready="1"]');
  assert.equal(await page.locator('.task').count(), 2);
  assert.equal(log.filter((l) => l.startsWith('pageerror') || l.startsWith('error')).length, 0, log.join('\n'));
  await ctx.close();
});

test('Optionale Felder: Patient, Morgen, Frist, Wichtig, manuelle Art', async () => {
  const { ctx, page } = await H.newPage(browser, base);
  await H.quickAdd(page, 'Unterlagen sichten', { patient: 'musterfrau e', recall: '1d', deadline: '2026-11-12', important: true, type: 'antrag' });
  const t = await page.evaluate(() => { const t = Array.from(WV.state.tasks.values())[0]; const p = WV.state.patients.get(t.v.patientId); return { v: t.v, label: p.v.label }; });
  assert.equal(t.label, 'Musterfrau, E.');
  assert.equal(t.v.recall, '2026-11-11');
  assert.equal(t.v.deadline, '2026-11-12');
  assert.equal(t.v.important, true);
  assert.equal(t.v.type, 'antrag');
  assert.equal(t.v.typeAuto, false);
  // Frist in 2 Tagen → "Heute & überfällig", gelb
  assert.deepEqual(await H.sectionTitles(page, 'today'), ['Unterlagen sichten']);
  assert.equal(await page.locator('.sec-today .dl').getAttribute('class'), 'dl dl-yellow');
  // Felder zurückgesetzt
  assert.equal(await page.inputValue('#qPatient'), '');
  assert.equal(await page.getAttribute('#qImportant', 'aria-pressed'), 'false');
  assert.equal(await page.getAttribute('#qRecallPicks [data-val="1w"]', 'aria-checked'), 'true');
  await ctx.close();
});

test('Gleiches Kürzel: Auswahl bestehender Patient oder bewusst neuer Patient', async () => {
  const { ctx, page } = await H.newPage(browser, base);
  await H.quickAdd(page, 'Arztbrief fertigstellen', { patient: 'Müller, M.' });
  // Exakter Treffer → bestehender Patient vorausgewählt, Kontext sichtbar
  await page.fill('#qTitle', 'Labor kontrollieren');
  await page.fill('#qPatient', 'Müller, M.');
  const firstOpt = await page.textContent('#qPatientList li.active');
  assert.match(firstOpt, /Müller, M\..*1 offen: Arztbrief fertigstellen/);
  await page.press('#qPatient', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('.task').length === 2);
  // Bewusst anderer Patient mit gleichem Kürzel
  await H.quickAdd(page, 'Rückruf durchführen', { patient: 'Müller, M.', patientPick: 1 });
  const pats = await page.evaluate(() => Array.from(WV.state.patients.values()).length);
  assert.equal(pats, 2);
  const labels = await page.evaluate(() => Array.from(document.querySelectorAll('.task .pat')).map((e) => e.textContent).sort());
  assert.deepEqual(labels, ['Müller, M.', 'Müller, M.', 'Müller, M. (2)']);
  // Teiltreffer wird nicht still zugeordnet
  await page.fill('#qTitle', 'Bescheinigung erstellen');
  await page.fill('#qPatient', 'Mül');
  assert.match(await page.textContent('#qPatientList li.active'), /Neu anlegen/);
  await page.fill('#qPatient', '');
  await page.fill('#qTitle', '');
  await ctx.close();
});

test('Entwurf geht bei Neuladen nicht verloren; Hinweis bei Ziffern im Patientenfeld', async () => {
  const { ctx, page } = await H.newPage(browser, base);
  await page.fill('#qTitle', 'Halb getippte Aufgabe');
  await page.fill('#qPatient', 'Test 12.03.1980');
  assert.match(await page.textContent('#qPatientHint'), /keine Nummern oder Daten/);
  await page.reload(); await page.waitForSelector('html[data-ready="1"]');
  assert.equal(await page.inputValue('#qTitle'), 'Halb getippte Aufgabe');
  await ctx.close();
});

test('Bereiche, Sortierung und Zähler mit festen Daten', async () => {
  const { ctx, page } = await H.newPage(browser, base);
  await H.seed(page, [
    { title: 'A überfällig alt', recall: '2026-10-20' },
    { title: 'B überfällig wichtig', recall: '2026-10-20', important: true },
    { title: 'C Frist heute', recall: '2026-11-25', deadline: '2026-11-10' },
    { title: 'D WV heute', recall: '2026-11-10' },
    { title: 'E Frist übermorgen', recall: '2026-12-01', deadline: '2026-11-12' },
    { title: 'F Woche', recall: '2026-11-14' },
    { title: 'G später', recall: '2027-01-05' },
    { title: 'H Frist überschritten', recall: '2026-11-08', deadline: '2026-11-03' }
  ]);
  assert.deepEqual(await H.counters(page), [3, 2, 8]); // überfällig, heute fällig, offen gesamt
  assert.deepEqual(await H.sectionTitles(page, 'today'), ['H Frist überschritten', 'C Frist heute', 'E Frist übermorgen', 'B überfällig wichtig', 'D WV heute', 'A überfällig alt']);
  // A ist länger als 7 Tage überfällig, nicht wichtig → eingeklappt, aber gezählt
  assert.equal(await page.locator('.sec-today details.sub').getAttribute('open'), null);
  assert.match(await page.textContent('.sec-today .sec-comp'), /3 überfällig · 2 heute fällig · 1 Frist in 1–2 Tagen/);
  assert.deepEqual(await H.sectionTitles(page, 'week'), ['F Woche']);
  assert.deepEqual(await H.sectionTitles(page, 'later'), ['G später']);
  assert.match(await page.textContent('.task[aria-label^="A überfällig"] .recall'), /Seit 21 Tagen/);
  assert.equal(await page.locator('.task[aria-label^="C Frist heute"] .dl').getAttribute('class'), 'dl dl-red');
  await ctx.close();
});

test('Erledigen mit Rückgängig; Verschieben ab späterem Zeitpunkt, Frist unverändert', async () => {
  const { ctx, page } = await H.newPage(browser, base);
  await H.seed(page, [
    { title: 'Zukunft', recall: '2026-11-15', deadline: '2026-11-30' },
    { title: 'Vergangen', recall: '2026-11-05' },
    { title: 'Erledigen', recall: '2026-11-10' }
  ]);
  const recallOf = (title) => page.evaluate((t) => Array.from(WV.state.tasks.values()).find((x) => x.v.title === t).v.recall, title);
  await page.click('.task[aria-label^="Zukunft"] [data-act="pp-w"]');
  await page.waitForFunction(() => Array.from(WV.state.tasks.values()).find((x) => x.v.title === 'Zukunft').v.recall === '2026-11-22');
  await page.click('.task[aria-label^="Vergangen"] [data-act="pp-d"]');
  await page.waitForFunction(() => Array.from(WV.state.tasks.values()).find((x) => x.v.title === 'Vergangen').v.recall === '2026-11-11');
  assert.equal(await recallOf('Zukunft'), '2026-11-22');
  const v = await page.evaluate(() => Object.fromEntries(Array.from(WV.state.tasks.values()).map((t) => [t.v.title, [t.v.recall, t.v.deadline, WV.model.postponeCount(t)]])));
  assert.deepEqual(v['Zukunft'], ['2026-11-22', '2026-11-30', 1]);
  assert.deepEqual(v['Vergangen'], ['2026-11-11', null, 1]);
  await page.click('.task[aria-label^="Erledigen"] [data-act="done"]');
  await page.waitForFunction(() => !document.querySelector('.sec-today .task'));
  assert.match(await page.textContent('.sec-done summary'), /Erledigt\s*1/);
  await page.click('.toast:has-text("Erledigt") button:has-text("Rückgängig")');
  await page.waitForFunction(() => document.querySelectorAll('.sec-today .task').length === 1);
  const st = await page.evaluate(() => Array.from(WV.state.tasks.values()).find((t) => t.v.title === 'Erledigen').v);
  assert.equal(st.status, 'open');
  assert.equal(st.doneAt, null);
  // Verschieben rückgängig: Datum und Zähler zurück
  await page.click('.task[aria-label^="Vergangen"] [data-act="pp-m"]');
  await page.waitForFunction(() => Array.from(WV.state.tasks.values()).find((x) => x.v.title === 'Vergangen').v.recall === '2026-12-11');
  await page.click('.toast:has-text("Verschoben auf") button:has-text("Rückgängig") >> nth=-1');
  await page.waitForFunction(() => Array.from(WV.state.tasks.values()).find((t) => t.v.title === 'Vergangen').v.recall === '2026-11-11');
  const pc = await page.evaluate(() => WV.model.postponeCount(Array.from(WV.state.tasks.values()).find((t) => t.v.title === 'Vergangen')));
  assert.equal(pc, 1);
  await ctx.close();
});

test('Bearbeiten: automatisches Speichern, Esc schließt, Löschen mit Rückgängig', async () => {
  const { ctx, page } = await H.newPage(browser, base);
  await H.seed(page, [{ title: 'Brief diktieren', recall: '2026-11-12' }]);
  await page.click('.task .title');
  await page.waitForSelector('#dlgEdit[open]');
  await page.fill('#eTitle', 'Brief diktieren und senden');
  await page.fill('#eDeadline', '2026-11-20');
  await page.click('#eTypes [data-type="mail"]');
  await page.fill('#eNote', 'Nach Rückmeldung Sekretariat');
  await page.waitForFunction(() => document.getElementById('eSaveState').textContent === 'Gespeichert');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('dlgEdit').open);
  await page.reload(); await page.waitForSelector('html[data-ready="1"]');
  const t = await page.evaluate(() => { const t = Array.from(WV.state.tasks.values())[0]; return { v: t.v, note: WV.state.local.get(t.id).note }; });
  assert.equal(t.v.title, 'Brief diktieren und senden');
  assert.equal(t.v.deadline, '2026-11-20');
  assert.equal(t.v.type, 'mail');
  assert.equal(t.note, 'Nach Rückmeldung Sekretariat');
  // Esc schließt auch direkt nach einer Eingabe – Änderung wird trotzdem gespeichert
  await page.click('.task .title');
  await page.fill('#eTitle', 'Brief senden');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('dlgEdit').open);
  await page.waitForFunction(() => Array.from(WV.state.tasks.values())[0].v.title === 'Brief senden');
  // Löschen + Rückgängig
  await page.click('.task .title');
  await page.click('#eDelete');
  await page.waitForFunction(() => document.querySelectorAll('.task').length === 0);
  await page.click('.toast:has-text("Gelöscht") button:has-text("Rückgängig")');
  await page.waitForFunction(() => document.querySelectorAll('.task').length === 1);
  // Löschen ohne Rückgängig → Löschmarker bleibt technisch erhalten
  await page.click('.task .title');
  await page.click('#eDelete');
  await page.waitForFunction(() => document.querySelectorAll('.task').length === 0);
  const del = await page.evaluate(() => Array.from(WV.state.tasks.values())[0].v);
  assert.equal(del.deleted, true);
  assert.equal(del.title, 'Brief senden');
  await ctx.close();
});

test('Erledigt-Bereich: Suche, Wiederherstellen, endgültig löschen mit Rückfrage', async () => {
  const { ctx, page } = await H.newPage(browser, base);
  await H.seed(page, [{ title: 'Attest schreiben', recall: '2026-11-10' }, { title: 'Formular faxen', recall: '2026-11-10' }]);
  await page.click('.task[aria-label^="Attest"] [data-act="done"]');
  await page.click('.task[aria-label^="Formular"] [data-act="done"]');
  await page.fill('#search', 'attest');
  await page.waitForFunction(() => document.querySelector('.sec-done').open && document.querySelectorAll('.sec-done .task').length === 1);
  await page.click('.sec-done .task [data-act="restore"]');
  await page.waitForFunction(() => document.querySelectorAll('.sec-today .task').length === 1);
  await page.click('#fReset');
  await page.click('#fStatus [data-val="done"]');
  await page.click('.sec-done .task [data-act="purge"]');
  await page.click('.sec-done .task [data-act="purge-yes"]');
  await page.waitForFunction(() => document.querySelectorAll('.sec-done .task').length === 0);
  const purged = await page.evaluate(() => Array.from(WV.state.tasks.values()).find((t) => t.v.purged).v);
  assert.equal(purged.title, '');
  assert.equal(purged.deleted, true);
  await ctx.close();
});

test('Suche und Filter (Titel, Patient, Notiz, Art, Wichtig, Status) und Zurücksetzen', async () => {
  const { ctx, page } = await H.newPage(browser, base);
  await H.seed(page, [
    { title: 'Labor kontrollieren', patient: 'Beispiel, K.', recall: '2026-11-11' },
    { title: 'Rezept vorbereiten', recall: '2026-11-11', important: true, note: 'Praxis Sonnenschein' },
    { title: 'Antrag bearbeiten', recall: '2026-11-20' }
  ]);
  const visible = () => page.evaluate(() => Array.from(document.querySelectorAll('.sec:not(.sec-done) .task .title')).map((e) => e.textContent).sort());
  await page.fill('#search', 'beispiel');
  await page.waitForFunction(() => document.querySelectorAll('.sec:not(.sec-done) .task').length === 1);
  assert.deepEqual(await visible(), ['Labor kontrollieren']);
  await page.fill('#search', 'sonnenschein');
  await page.waitForFunction(() => document.querySelector('.sec:not(.sec-done) .task .title').textContent === 'Rezept vorbereiten');
  await page.fill('#search', '');
  await page.selectOption('#fType', 'antrag');
  assert.deepEqual(await visible(), ['Antrag bearbeiten']);
  await page.selectOption('#fType', '');
  await page.click('#fImportant');
  assert.deepEqual(await visible(), ['Rezept vorbereiten']);
  assert.equal(await page.isVisible('#fReset'), true);
  await page.click('#fReset');
  assert.deepEqual(await visible(), ['Antrag bearbeiten', 'Labor kontrollieren', 'Rezept vorbereiten']);
  assert.equal(await page.isVisible('#fReset'), false);
  await ctx.close();
});

test('Tastatur: N, /, Pfeiltasten, E/T/W/M auf Zeilen', async () => {
  const { ctx, page } = await H.newPage(browser, base);
  await H.seed(page, [{ title: 'Eins', recall: '2026-11-10' }, { title: 'Zwei', recall: '2026-11-10' }, { title: 'Drei', recall: '2026-11-10' }]);
  await page.click('.foot');
  await page.keyboard.press('/');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'search');
  await page.keyboard.press('Escape');
  await page.click('.foot');
  await page.keyboard.press('n');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'qTitle');
  assert.equal(await page.inputValue('#qTitle'), '');
  await page.focus('.task[aria-label^="Eins"]');
  await page.keyboard.press('ArrowDown');
  assert.match(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), /^Zwei/);
  await page.keyboard.press('w');
  await page.waitForFunction(() => Array.from(WV.state.tasks.values()).find((t) => t.v.title === 'Zwei').v.recall === '2026-11-17');
  // Fokus bleibt in der Liste (nächste Zeile)
  assert.match(await page.evaluate(() => document.activeElement.getAttribute('aria-label') || ''), /^(Drei|Eins)/);
  await page.focus('.task[aria-label^="Drei"]');
  await page.keyboard.press('e');
  await page.waitForFunction(() => Array.from(WV.state.tasks.values()).find((t) => t.v.title === 'Drei').v.status === 'done');
  await page.focus('.task[aria-label^="Eins"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#dlgEdit[open]');
  await page.keyboard.press('Escape');
  await ctx.close();
});

test('Freitext wird nie als HTML ausgeführt (XSS-Schutz), keine Inhalte in der Konsole', async () => {
  const { ctx, page, log } = await H.newPage(browser, base);
  let dialog = false;
  page.on('dialog', async (d) => { dialog = true; await d.dismiss(); });
  const evil = '<img src=x onerror=alert(1)> Befund';
  await page.fill('#qTitle', evil);
  await page.fill('#qPatient', '<b>X</b>, Y');
  await page.press('#qPatient', 'Enter');
  await page.waitForSelector('.task');
  assert.equal(await page.textContent('.task .title'), evil);
  assert.equal(await page.locator('.task img').count(), 0);
  assert.equal(dialog, false);
  assert.equal(log.filter((l) => l.includes('Befund') || l.includes('onerror')).length, 0, log.join('\n'));
  await ctx.close();
});

test('Farbschema hell/dunkel umschaltbar und gespeichert', async () => {
  const { ctx, page } = await H.newPage(browser, base);
  await page.click('#btnSettings');
  await page.click('#dlgSettings .seg-btn[data-val="dark"]');
  assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
  await page.keyboard.press('Escape');
  await page.reload(); await page.waitForSelector('html[data-ready="1"]');
  assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(bg, 'rgb(19, 26, 32)');
  await ctx.close();
});

test('Schnellwahl Wiedervorlage: Ende der Woche, 3/4 Wochen, unbekannt; Datum im Bearbeiten entfernen', async () => {
  const { ctx, page } = await H.newPage(browser, base);
  const labels = await page.evaluate(() => Array.from(document.querySelectorAll('#qRecallPicks .seg-btn')).map((b) => b.textContent));
  assert.deepEqual(labels, ['Morgen', 'Ende der Woche', '1 Woche', '2 Wochen', '3 Wochen', '4 Wochen', 'unbekannt']);
  assert.equal(await page.getAttribute('#qTypes .chip >> nth=0', 'data-type'), 'doku');
  await H.quickAdd(page, 'Ende-der-Woche-Aufgabe', { recall: 'eow' });
  await H.quickAdd(page, 'Drei Wochen', { recall: '3w' });
  await H.quickAdd(page, 'Vier Wochen', { recall: '4w' });
  await page.fill('#qTitle', 'Irgendwann klären');
  await page.click('#qRecallPicks [data-val="none"]');
  assert.equal(await page.inputValue('#qRecallDate'), '');
  await page.press('#qTitle', 'Enter');
  await page.waitForSelector('.sec-nodate .task');
  const r = await page.evaluate(() => Object.fromEntries(Array.from(WV.state.tasks.values()).map((t) => [t.v.title, t.v.recall])));
  assert.deepEqual(r, { 'Ende-der-Woche-Aufgabe': '2026-11-13', 'Drei Wochen': '2026-12-01', 'Vier Wochen': '2026-12-08', 'Irgendwann klären': null });
  assert.match(await page.textContent('.sec-nodate'), /Wiedervorlage unbekannt\s*1[\s\S]*Datum unbekannt/);
  assert.deepEqual(await H.counters(page), [0, 0, 4]);
  // Nach Speichern Schnellwahl wieder auf 1 Woche
  assert.equal(await page.getAttribute('#qRecallPicks [data-val="1w"]', 'aria-checked'), 'true');
  // +1 Woche bei unbekanntem Datum → ab heute
  await page.click('.sec-nodate .task [data-act="pp-w"]');
  await page.waitForFunction(() => Array.from(WV.state.tasks.values()).find((t) => t.v.title === 'Irgendwann klären').v.recall === '2026-11-17');
  // Im Bearbeiten Datum entfernen → unbekannt
  await page.click('.task[aria-label^="Vier Wochen"] .title');
  await page.click('#eRecallClear');
  await page.waitForFunction(() => Array.from(WV.state.tasks.values()).find((t) => t.v.title === 'Vier Wochen').v.recall === null);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sec-nodate .task[aria-label^="Vier Wochen"]');
  await ctx.close();
});
