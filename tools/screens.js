// Erstellt Screenshots mit fiktiven Daten (docs/screenshots)
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium, devices } = require('playwright');
const H = require('../tests/e2e/helpers');
const OUT = path.join(H.ROOT, 'docs', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const DATA = [
  { title: 'Arztbrief fertigstellen', patient: 'Musterfrau, E.', recall: '2026-11-06', deadline: '2026-11-10', note: 'Vorbefunde liegen im Postfach' },
  { title: 'Labor kontrollieren', patient: 'Beispiel, K.', recall: '2026-11-10' },
  { title: 'Rückruf durchführen', patient: 'Müller, M.', recall: '2026-11-09' },
  { title: 'RS mit OA wegen Antrag', recall: '2026-11-10' },
  { title: 'Bescheinigung erstellen', patient: 'Mustermann, J.', recall: '2026-11-20', deadline: '2026-11-12' },
  { title: 'Fall im PIA-Team vorstellen', recall: '2026-11-12' },
  { title: 'Rezept vorbereiten', patient: 'Sommer, T.', recall: '2026-11-13', important: true },
  { title: 'Mail an Betreuerin beantworten', recall: '2026-11-11' },
  { title: 'PIA-Intervision Fall vorbereiten', recall: '2026-11-16' },
  { title: 'Doku Gruppentermin nachtragen', recall: '2026-11-11' },
  { title: 'Antrag Reha bearbeiten', patient: 'Testmann, R.', recall: '2026-11-24', deadline: '2026-11-28' },
  { title: 'Vorbereitung Supervision', recall: '2026-12-07' },
  { title: 'Formular Rentenversicherung ergänzen', recall: '2026-10-28' },
  { title: 'Attest schreiben', patient: 'Beispiel, K.', recall: '2026-11-05', done: true }
];

async function fill(page) {
  await H.seed(page, DATA.filter((d) => !d.done));
  // zweiter Patient mit gleichem Kürzel
  await page.evaluate(async () => {
    await WV.actions.create({ title: 'Befund Kardiologie anfordern', type: 'befund', typeAuto: true, patient: { newLabel: 'Müller, M.' }, recall: '2026-12-01', deadline: null, important: false });
    const done = await WV.actions.create({ title: 'Attest schreiben', type: 'bescheinigung', typeAuto: true, patient: null, recall: '2026-11-05' });
    await WV.actions.update(done.created.id, { status: 'done' });
    WV.ui.render();
  });
}

(async () => {
  const { serve } = await import(path.join(H.ROOT, 'tools', 'serve.mjs'));
  const s = await serve(H.APP);
  const base = `http://127.0.0.1:${s.port}/`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wv-shots-'));
  const ctx = await chromium.launchPersistentContext(dir, { args: ['--lang=de-DE'], viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  const page = ctx.pages()[0];
  await page.clock.setFixedTime(new Date(H.NOW));
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Wiedervorlage-Sicherung', { create: true });
  });
  await page.goto(base); await page.waitForSelector('html[data-ready="1"]');
  await page.screenshot({ path: path.join(OUT, '00_start_leer.png') });
  await fill(page);
  // Sicherung einrichten (Passphrase + Ordner)
  await page.evaluate(() => WV.backupCtl.setupKey('Kompass Ahorn Tinte Wolke Fahrrad'));
  await page.evaluate(() => WV.backupCtl.connectFolder());
  await page.waitForFunction(() => document.getElementById('backupPill').textContent.includes('Gesichert'));
  await page.evaluate(() => { document.querySelectorAll('.toast').forEach((t) => t.remove()); });
  await page.fill('#qTitle', 'Rezept für Musterfrau vorbereiten');
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(OUT, '01_pc_1280_uebersicht.png') });
  await page.fill('#qTitle', '');
  await page.evaluate(() => { localStorage.removeItem('wv-draft'); });

  // Patientenauswahl mit gleichem Kürzel
  await page.fill('#qTitle', 'Termin klären');
  await page.fill('#qPatient', 'Müller, M.');
  await page.screenshot({ path: path.join(OUT, '02_pc_patientenauswahl.png'), clip: { x: 0, y: 50, width: 1280, height: 420 } });
  await page.fill('#qPatient', ''); await page.fill('#qTitle', '');

  // Bearbeitungsfenster
  await page.click('.task[aria-label^="Arztbrief"] .title');
  await page.waitForSelector('#dlgEdit[open]');
  await page.screenshot({ path: path.join(OUT, '03_pc_bearbeiten.png') });
  await page.keyboard.press('Escape');

  // Sicherung & Einstellungen
  await page.click('#btnSettings');
  await page.screenshot({ path: path.join(OUT, '04_pc_sicherung.png') });
  await page.keyboard.press('Escape');

  // Suche
  await page.fill('#search', 'müller');
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, '05_pc_suche_patient.png'), clip: { x: 0, y: 0, width: 1280, height: 640 } });
  await page.fill('#search', '');
  await page.waitForTimeout(250);

  // 1920 px
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({ path: path.join(OUT, '06_pc_1920.png') });

  // Dunkel
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => { WV.state.ui.theme = 'dark'; WV.ui.applyTheme(); });
  await page.screenshot({ path: path.join(OUT, '07_pc_dunkel.png') });
  await page.evaluate(() => { WV.state.ui.theme = 'auto'; WV.ui.applyTheme(); });

  // Rückgängig-Meldung nach Erledigen
  await page.click('.task[aria-label^="Labor"] [data-act="done"]');
  await page.screenshot({ path: path.join(OUT, '08_pc_erledigt_rueckgaengig.png'), clip: { x: 0, y: 560, width: 1280, height: 340 } });
  await ctx.close();

  // iPhone 13 (simuliert in Chromium – kein echtes Safari)
  const b = await chromium.launch({ args: ['--lang=de-DE'] });
  const mctx = await b.newContext(Object.assign({}, devices['iPhone 13'], { locale: 'de-DE', timezoneId: 'Europe/Berlin' }));
  const m = await mctx.newPage();
  await m.clock.setFixedTime(new Date(H.NOW));
  await m.goto(base); await m.waitForSelector('html[data-ready="1"]');
  await fill(m);
  await m.screenshot({ path: path.join(OUT, '09_iphone13_simuliert_oben.png') });
  await m.evaluate(() => window.scrollTo(0, document.querySelector('.sec-today').offsetTop - 60));
  await m.screenshot({ path: path.join(OUT, '10_iphone13_simuliert_liste.png') });
  await m.click('.task[aria-label^="Rezept"] .title');
  await m.waitForSelector('#dlgEdit[open]');
  await m.screenshot({ path: path.join(OUT, '11_iphone13_simuliert_bearbeiten.png') });
  await b.close();
  await s.close();
  console.log('Screenshots in', OUT, fs.readdirSync(OUT).join(', '));
})();
