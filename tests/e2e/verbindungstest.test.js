const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers');

let server, browser, base;
test.before(async () => { server = await H.startServer(); browser = await H.launch(); base = `http://127.0.0.1:${server.port}/`; });
test.after(async () => { await browser.close(); await server.close(); });

// Google Drive (appDataFolder) wird im Browser nachgebildet – prüft den Ablauf der Testseite, nicht Google selbst
function fakeDrive(page, log) {
  const files = new Map(); let n = 0;
  return page.route('https://www.googleapis.com/**', async (route) => {
    const req = route.request(); const url = new URL(req.url());
    log.push(req.method() + ' ' + url.pathname + ' auth=' + (req.headers().authorization === 'Bearer TESTTOKEN'));
    const json = (o, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(o) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
    if (url.pathname === '/drive/v3/files' && req.method() === 'GET') return json({ files: [...files.keys()].map((id) => ({ id, name: 'x' })) });
    if (url.pathname === '/upload/drive/v3/files' && req.method() === 'POST') {
      const body = req.postData(); const m = body.match(/text\/plain; charset=UTF-8\r\n\r\n([\s\S]*?)\r\n--/);
      const id = 'f' + (++n); files.set(id, { content: m[1], version: 1, parents: JSON.parse(body.match(/\{.*\}/)[0]).parents });
      return json({ id, version: '1' });
    }
    const idm = url.pathname.match(/files\/([^/]+)$/); const id = idm && idm[1]; const f = id && files.get(id);
    if (!f) return json({ error: { status: 'NOT_FOUND' } }, 404);
    if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: f.content });
    if (req.method() === 'PATCH') { f.content = req.postData(); f.version++; return json({ id, version: String(f.version) }); }
    if (req.method() === 'DELETE') { files.delete(id); return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } }); }
    return json({}, 400);
  }).then(() => files);
}

test('Verbindungstest: ohne Client-ID verständlicher Hinweis', async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage(); const log = [];
  page.on('console', (m) => log.push(m.text())); page.on('pageerror', (e) => log.push('pageerror ' + e.message));
  // Konfiguration ohne Client-ID nachbilden
  await page.route('**/config.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: "self.WV_CONFIG = { googleClientId: '' };" }));
  await page.goto(base + 'verbindungstest.html');
  assert.match(await page.textContent('#env'), /Client-ID\s*fehlt noch/);
  await page.click('#btnLogin');
  assert.match(await page.textContent('#results'), /Client-ID fehlt/);
  assert.deepEqual(log.filter((l) => /pageerror|Content Security/.test(l)), []);
  await ctx.close();
});

test('Verbindungstest: Rückkehr von Google, Drive-Ablauf, Token aus Adresszeile entfernt, falscher state abgewiesen', async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (/Content Security/.test(m.text())) errs.push(m.text()); });
  const calls = []; const files = await fakeDrive(page, calls);
  await page.goto(base + 'verbindungstest.html');
  await page.evaluate(() => { sessionStorage.setItem('wv-test-oauth-state', 'abc123'); });
  await page.goto('about:blank'); // echte Rückkehr von Google ist ein vollständiger Seitenaufruf
  await page.goto(base + 'verbindungstest.html#access_token=TESTTOKEN&token_type=Bearer&expires_in=3599&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.appdata&state=abc123');
  await page.waitForSelector('#results li:has-text("Gesamtergebnis")');
  const text = await page.textContent('#results');
  assert.match(text, /✓ Anmeldung erfolgreich/);
  assert.match(text, /nur eigener App-Ordner/);
  assert.match(text, /✓ Testdatei lesen.*Inhalt identisch/);
  assert.match(text, /Version 1 → 2/);
  assert.match(text, /✓ Testdatei löschen/);
  assert.equal(files.size, 0);
  assert.ok(calls.every((c) => c.endsWith('auth=true')), calls.join('\n'));
  assert.equal(new URL(page.url()).hash, '');
  assert.ok(!(await page.inputValue('#summary')).includes('TESTTOKEN'));
  // Falscher state → abgewiesen, keine API-Aufrufe
  calls.length = 0;
  await page.evaluate(() => { sessionStorage.setItem('wv-test-oauth-state', 'richtig'); });
  await page.goto('about:blank');
  await page.goto(base + 'verbindungstest.html#access_token=TESTTOKEN&expires_in=3599&scope=x&state=falsch');
  await page.waitForSelector('#results li:has-text("Anmeldung")');
  assert.match(await page.textContent('#results'), /Rückkehr passt nicht zur Anmeldung/);
  assert.equal(calls.length, 0);
  assert.deepEqual(errs, []);
  await ctx.close();
});
