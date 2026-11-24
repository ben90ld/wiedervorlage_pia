// Version 2: Schnellwahl, Erstelldatum, Fristmeldungen, Sterne, Aufwand, eigene Reihenfolge
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

let server, browser, base;
test.before(async () => { server = await H.startServer(); browser = await H.launch(); base = `http://127.0.0.1:${server.port}/`; });
test.after(async () => { await browser.close(); await server.close(); });

const order = (page, sec) => page.evaluate((c) => Array.from(document.querySelectorAll('.sec-' + c + ' .rows .task .title')).map((e) => e.textContent), sec);
const rec = (page, title) => page.evaluate((x) => Array.from(WV.state.tasks.values()).find((t) => t.v.title === x).v, title);

test('Schnellwahl Heute (später), +2 Tage, +3 Tage; Erstelldatum an jeder Aufgabe', async () => {
  const { ctx, page } = await H.newPage(browser, base);
  await H.quickAdd(page, 'Heute noch', { recall: 'today' });
  await H.quickAdd(page, 'In zwei Tagen', { recall: '2d' });
  await H.quickAdd(page, 'In drei Tagen', { recall: '3d' });
  assert.equal((await rec(page, 'Heute noch')).recall, '2026-11-10');
  assert.equal((await rec(page, 'In zwei Tagen')).recall, '2026-11-12');
  assert.equal((await rec(page, 'In drei Tagen')).recall, '2026-11-13');
  assert.deepEqual(await order(page, 'today'), ['Heute noch']);
  const created = await page.evaluate(() => Array.from(document.querySelectorAll('.task .created')).map((e) => e.textContent));
  assert.deepEqual(created, ['erstellt 10.11.', 'erstellt 10.11.', 'erstellt 10.11.']);
  // Wiedervorlage an einem bestimmten Tag, Frist getrennt davon
  await page.fill('#qTitle', 'Termin geplant');
  await page.fill('#qRecallDate', '2026-12-02');
  await page.fill('#qDeadline', '2026-12-15');
  await page.press('#qTitle', 'Enter');
  await page.waitForFunction(() => Array.from(WV.state.tasks.values()).some((t) => t.v.title === 'Termin geplant'));
  const g = await rec(page, 'Termin geplant');
  assert.equal(g.recall, '2026-12-02'); assert.equal(g.deadline, '2026-12-15');
  await ctx.close();
});

test('Fristmeldungen: nähert sich, läuft heute ab, abgelaufen', async () => {
  const { ctx, page } = await H.newPage(browser, base);
  await H.seed(page, [
    { title: 'Abgelaufen', recall: '2026-11-20', deadline: '2026-11-08' },
    { title: 'Heute', recall: '2026-11-20', deadline: '2026-11-10' },
    { title: 'Morgen', recall: '2026-11-20', deadline: '2026-11-11' },
    { title: 'In drei Tagen', recall: '2026-11-20', deadline: '2026-11-13' },
    { title: 'Später', recall: '2026-11-20', deadline: '2026-11-25' }
  ]);
  const dl = (t) => page.textContent(`.task[aria-label^="${t},"] .dl`);
  assert.equal(await dl('Abgelaufen'), 'Frist abgelaufen! (08.11.)');
  assert.equal(await dl('Heute'), 'Frist läuft heute ab!');
  assert.equal(await dl('Morgen'), 'Frist nähert sich! (morgen)');
  assert.equal(await dl('In drei Tagen'), 'Frist nähert sich! (Fr 13.11.)');
  assert.equal(await dl('Später'), 'Frist Mi 25.11.');
  assert.equal(await page.locator('.task[aria-label^="Abgelaufen,"] .dl').getAttribute('class'), 'dl dl-over');
  await ctx.close();
});

test('Wichtigkeit mit bis zu zwei Sternen; Aufwand L/M/S ankreuzen', async () => {
  const { ctx, page } = await H.newPage(browser, base);
  await H.quickAdd(page, 'Normal', { recall: 'today' });
  await H.quickAdd(page, 'Ein Stern', { recall: 'today', important: 1, effort: 'L' });
  await H.quickAdd(page, 'Zwei Sterne', { recall: 'today', important: 2, effort: 'S' });
  assert.deepEqual(await order(page, 'today'), ['Zwei Sterne', 'Ein Stern', 'Normal']);
  assert.equal(await page.locator('.task[aria-label^="Zwei Sterne"] .imp svg').count(), 2);
  assert.equal(await page.locator('.task[aria-label^="Ein Stern"] .imp svg').count(), 1);
  assert.equal(await page.getAttribute('.task[aria-label^="Zwei Sterne"] .eff', 'title'), 'Aufwand: schwer');
  assert.equal(await page.textContent('.task[aria-label^="Ein Stern"] .eff'), 'L Aufwand leicht');
  // Bearbeiten: Aufwand ändern und wieder entfernen, Wichtigkeit ändern
  await page.click('.task[aria-label^="Normal"] .title');
  await page.click('#eEffort [data-val="M"]');
  await page.click('#eImportance [data-val="2"]');
  await page.waitForFunction(() => { const t = Array.from(WV.state.tasks.values()).find((x) => x.v.title === 'Normal'); return t.v.effort === 'M' && t.v.important === 2; });
  await page.click('#eEffort [data-val="M"]');
  await page.waitForFunction(() => Array.from(WV.state.tasks.values()).find((x) => x.v.title === 'Normal').v.effort === null);
  await page.keyboard.press('Escape');
  // Filter "Wichtig" zeigt beide Stufen
  await page.click('#fImportant');
  assert.equal((await order(page, 'today')).length, 3);
  await ctx.close();
});

test('Eigene Reihenfolge: Ziehen mit der Maus, Alt + Pfeil, bleibt nach Neuladen, Zurücksetzen', async () => {
  const { ctx, page } = await H.newPage(browser, base);
  await H.seed(page, [
    { title: 'A Frist heute', recall: '2026-11-10', deadline: '2026-11-10' },
    { title: 'B normal', recall: '2026-11-10' },
    { title: 'C normal', recall: '2026-11-10' },
    { title: 'D normal', recall: '2026-11-10' }
  ]);
  assert.deepEqual(await order(page, 'today'), ['A Frist heute', 'B normal', 'C normal', 'D normal']);
  // D ganz nach oben ziehen
  const handle = page.locator('.task[aria-label^="D normal"] .drag');
  const target = page.locator('.task[aria-label^="A Frist heute"]');
  const hb = await handle.boundingBox(), tb = await target.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, tb.y + 5, { steps: 8 });
  await page.mouse.up();
  await page.waitForSelector('.toast:has-text("Reihenfolge gespeichert")');
  await page.waitForFunction(() => document.querySelector('.sec-today .rows .task .title').textContent === 'D normal');
  assert.deepEqual(await order(page, 'today'), ['D normal', 'A Frist heute', 'B normal', 'C normal']);
  assert.equal((await rec(page, 'D normal')).rank, 10);
  assert.equal((await rec(page, 'A Frist heute')).rank, null);
  // Kein Öffnen des Bearbeitungsfensters durch das Ziehen
  assert.equal(await page.evaluate(() => document.getElementById('dlgEdit').open), false);
  // Neue Aufgabe erscheint nach den eigenen Positionen
  await H.quickAdd(page, 'E neu', { recall: 'today' });
  assert.equal((await order(page, 'today'))[0], 'D normal');
  // Alt + Pfeil nach oben: C über B
  await page.focus('.task[aria-label^="C normal"]');
  await page.keyboard.press('Alt+ArrowUp');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.sec-today .rows .task .title')).map((e) => e.textContent).indexOf('C normal') === 2);
  assert.deepEqual((await order(page, 'today')).slice(0, 4), ['D normal', 'A Frist heute', 'C normal', 'B normal']);
  assert.match(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), /^C normal/);
  // bleibt nach Neuladen
  await page.reload(); await page.waitForSelector('html[data-ready="1"]');
  assert.deepEqual((await order(page, 'today')).slice(0, 4), ['D normal', 'A Frist heute', 'C normal', 'B normal']);
  // Verschieben hebt die eigene Position auf
  await page.click('.task[aria-label^="D normal"] [data-act="pp-d"]');
  await page.waitForFunction(() => Array.from(WV.state.tasks.values()).find((x) => x.v.title === 'D normal').v.rank === null);
  // Automatisch sortieren
  await page.click('.sec-today .reset-order');
  await page.waitForFunction(() => !document.querySelector('.sec-today .reset-order'));
  assert.deepEqual(await order(page, 'today'), ['A Frist heute', 'B normal', 'C normal', 'E neu']);
  await ctx.close();
});
