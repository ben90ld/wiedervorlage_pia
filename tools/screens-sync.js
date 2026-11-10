// Screenshots Synchronisation (nachgebildetes Google, fiktive Daten)
const path = require('path');
const { devices } = require('playwright');
const H = require('../tests/e2e/helpers');
const { createFakeGoogle } = require('../tests/e2e/fakegoogle');
const OUT = path.join(H.ROOT, 'docs', 'screenshots');
const PASS = 'Kompass Ahorn Tinte Wolke Fahrrad';
(async () => {
  const { serve } = await import(path.join(H.ROOT, 'tools', 'serve.mjs'));
  const s = await serve(H.APP); const base = `http://127.0.0.1:${s.port}/`;
  const b = await H.launch(); const fake = createFakeGoogle();
  const mk = async (opts) => { const ctx = await b.newContext(Object.assign(opts, { locale: 'de-DE', timezoneId: 'Europe/Berlin', serviceWorkers: 'block' })); await fake.attach(ctx); const p = await ctx.newPage(); await p.clock.setFixedTime(new Date(H.NOW)); await p.goto(base); await p.waitForSelector('html[data-ready="1"]'); return p; };
  const pc = await mk({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  await H.seed(pc, [
    { title: 'Arztbrief fertigstellen', patient: 'Musterfrau, E.', recall: '2026-11-06', deadline: '2026-11-10', note: 'Vorbefunde im Postfach' },
    { title: 'Labor kontrollieren', patient: 'Beispiel, K.', recall: '2026-11-10' },
    { title: 'RS mit OA wegen Antrag', recall: '2026-11-12' },
    { title: 'Doku Gruppentermin nachtragen', recall: '2026-11-11' }
  ]);
  await pc.click('#btnSettings'); await pc.click('#btnSyncSetup'); await pc.waitForSelector('html[data-ready="1"]');
  await pc.waitForSelector('#dlgPass[open]');
  await pc.screenshot({ path: path.join(OUT, '12_pc_sync_passphrase.png') });
  await pc.fill('#pass1', PASS); await pc.fill('#pass2', PASS); await pc.check('#passAck'); await pc.click('#dlgPass .btn.primary');
  await pc.waitForFunction(() => WV.sync.cfg().lastSyncAt && !WV.sync.st.running);
  const ip = await mk(Object.assign({}, devices['iPhone 13']));
  await ip.tap('#btnSettings'); await ip.tap('#btnSyncSetup'); await ip.waitForSelector('html[data-ready="1"]');
  await ip.waitForSelector('#unlockPass');
  await ip.screenshot({ path: path.join(OUT, '13_iphone13_simuliert_sync_passphrase.png') });
  await ip.fill('#unlockPass', PASS); await ip.press('#unlockPass', 'Enter');
  await ip.waitForFunction(() => WV.state.tasks.size === 4 && !WV.sync.st.running);
  await ip.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  await ip.screenshot({ path: path.join(OUT, '14_iphone13_simuliert_nach_sync.png') });
  await pc.evaluate(() => WV.ui.syncNow(false)); await pc.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  await pc.click('#btnSettings');
  await pc.screenshot({ path: path.join(OUT, '15_pc_sync_einstellungen.png') });
  await pc.keyboard.press('Escape');
  await pc.screenshot({ path: path.join(OUT, '16_pc_sync_status_kopfzeile.png'), clip: { x: 0, y: 0, width: 1280, height: 60 } });
  await b.close(); await s.close();
  console.log('ok');
})();
