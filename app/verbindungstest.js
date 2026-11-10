/* Wiedervorlage – Verbindungstest Google Drive (Machbarkeitsprüfung für Etappe 4)
 * Anmeldung per OAuth-Weiterleitung (response_type=token), Berechtigung nur drive.appdata.
 * Das Zugriffstoken bleibt im Arbeitsspeicher dieser Seite, wird nicht gespeichert und nicht angezeigt.
 */
(function () {
  'use strict';
  var cfg = self.WV_CONFIG || {};
  var SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  var API = 'https://www.googleapis.com';
  var STATE_KEY = 'wv-test-oauth-state';
  var $ = function (id) { return document.getElementById(id); };
  var lines = [];

  try {
    var th = JSON.parse(localStorage.getItem('wv-ui') || '{}').theme;
    if (th) document.documentElement.setAttribute('data-theme', th);
  } catch (e) { /* Standard */ }

  function standalone() {
    return window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }
  function device() {
    var ua = navigator.userAgent;
    if (/iPhone|iPad/.test(ua)) return 'iPhone/iPad (Safari/WebKit)';
    var m = ua.match(/Chrome\/(\d+)/);
    if (/Windows/.test(ua)) return 'Windows' + (m ? ', Chrome ' + m[1] : '');
    if (/Mac OS/.test(ua)) return 'Mac';
    return 'anderes Gerät';
  }

  function kv(k, v) {
    var d = document.createElement('div'); d.className = 'kv';
    var a = document.createElement('span'); a.className = 'k'; a.textContent = k;
    var b = document.createElement('span'); b.className = 'v'; b.textContent = v;
    d.appendChild(a); d.appendChild(b);
    return d;
  }

  function showEnv() {
    var env = $('env');
    env.textContent = '';
    env.appendChild(kv('Gerät', device()));
    env.appendChild(kv('Gestartet als', standalone() ? 'Home-Bildschirm-App / eigenes Fenster' : 'Browser-Tab'));
    env.appendChild(kv('Internet', navigator.onLine ? 'verbunden' : 'offline'));
    env.appendChild(kv('Client-ID', cfg.googleClientId ? 'eingetragen' : 'fehlt noch'));
  }

  function result(ok, label, detail) {
    var ul = $('results');
    if (!lines.length) ul.textContent = '';
    var li = document.createElement('li');
    li.textContent = (ok === true ? '✓ ' : ok === false ? '✗ ' : '• ') + label + (detail ? ' – ' + detail : '');
    li.className = ok === false ? 'warn-text' : '';
    ul.appendChild(li);
    lines.push(li.textContent);
  }

  function finish() {
    var sum = ['Verbindungstest Wiedervorlage', 'Zeit: ' + new Date().toLocaleString('de-DE'), 'Gerät: ' + device(),
      'Gestartet als: ' + (standalone() ? 'Home-Bildschirm-App' : 'Browser-Tab'), ''].concat(lines).join('\n');
    $('summary').value = sum;
    $('summary').hidden = false;
    $('btnCopy').hidden = false;
  }

  function randomHex(n) {
    var a = new Uint8Array(n); crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
  }

  function redirectUri() { return location.origin + location.pathname; }

  function startAuth(prompt) {
    if (!cfg.googleClientId) { result(false, 'Client-ID fehlt', 'bitte zuerst in config.js eintragen lassen'); finish(); return; }
    if (!navigator.onLine) { result(false, 'Keine Internetverbindung'); finish(); return; }
    var state = randomHex(16);
    try { sessionStorage.setItem(STATE_KEY, state); localStorage.setItem(STATE_KEY, state); } catch (e) { /* ohne Speicher */ }
    var p = new URLSearchParams({
      client_id: cfg.googleClientId, redirect_uri: redirectUri(), response_type: 'token',
      scope: SCOPE, state: state, include_granted_scopes: 'false'
    });
    p.set('prompt', prompt || 'select_account');
    location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + p.toString());
  }

  function readReturn() {
    if (!location.hash || location.hash.length < 2) return null;
    var h = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname + location.search); // Token sofort aus der Adresszeile entfernen
    var expected = null;
    try { expected = sessionStorage.getItem(STATE_KEY) || localStorage.getItem(STATE_KEY); sessionStorage.removeItem(STATE_KEY); localStorage.removeItem(STATE_KEY); } catch (e) { /* ignorieren */ }
    if (h.get('error')) return { error: h.get('error') };
    if (!expected || h.get('state') !== expected) return { error: 'state_mismatch' };
    if (!h.get('access_token')) return { error: 'no_token' };
    return { token: h.get('access_token'), expiresIn: Number(h.get('expires_in') || 0), scope: h.get('scope') || '' };
  }

  async function call(token, method, path, body, contentType) {
    var headers = { Authorization: 'Bearer ' + token };
    if (contentType) headers['Content-Type'] = contentType;
    var t0 = performance.now();
    var res;
    try {
      res = await fetch(API + path, { method: method, headers: headers, body: body, cache: 'no-store', referrerPolicy: 'no-referrer' });
    } catch (e) {
      var err = new Error('Netzwerkfehler (Verbindung blockiert oder unterbrochen)'); err.ms = Math.round(performance.now() - t0); throw err;
    }
    var ms = Math.round(performance.now() - t0);
    var text = await res.text();
    if (!res.ok) {
      var reason = '';
      try { var j = JSON.parse(text); reason = (j.error && (j.error.status || (j.error.errors && j.error.errors[0] && j.error.errors[0].reason))) || ''; } catch (e) { /* kein JSON */ }
      var e2 = new Error('HTTP ' + res.status + (reason ? ' ' + reason : '')); e2.ms = ms; throw e2;
    }
    return { text: text, ms: ms };
  }

  async function runTests(auth) {
    var token = auth.token;
    result(true, 'Anmeldung erfolgreich', 'Token gültig für ca. ' + Math.round(auth.expiresIn / 60) + ' Minuten');
    var scopes = auth.scope.split(' ');
    var onlyAppdata = scopes.length === 1 && scopes[0] === SCOPE;
    result(onlyAppdata, 'Berechtigung', onlyAppdata ? 'nur eigener App-Ordner (drive.appdata)' : 'unerwartet: ' + auth.scope);
    var id = null;
    var content1 = 'Wiedervorlage Verbindungstest ' + new Date().toISOString();
    var content2 = content1 + ' (geändert)';
    try {
      var r1 = await call(token, 'GET', '/drive/v3/files?spaces=appDataFolder&pageSize=100&fields=files(id,name)');
      var n = (JSON.parse(r1.text).files || []).length;
      result(true, 'App-Ordner lesen', n + ' Datei(en) vorhanden, ' + r1.ms + ' ms');

      var boundary = 'wv' + randomHex(8);
      var meta = JSON.stringify({ name: 'wv-verbindungstest.txt', parents: ['appDataFolder'] });
      var body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n--' + boundary +
        '\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n' + content1 + '\r\n--' + boundary + '--';
      var r2 = await call(token, 'POST', '/upload/drive/v3/files?uploadType=multipart&fields=id,version', body, 'multipart/related; boundary=' + boundary);
      var created = JSON.parse(r2.text); id = created.id;
      result(true, 'Testdatei anlegen (Hochladen)', r2.ms + ' ms');

      var r3 = await call(token, 'GET', '/drive/v3/files/' + encodeURIComponent(id) + '?alt=media');
      result(r3.text === content1, 'Testdatei lesen (Herunterladen)', (r3.text === content1 ? 'Inhalt identisch, ' : 'Inhalt ABWEICHEND, ') + r3.ms + ' ms');

      var r4 = await call(token, 'PATCH', '/upload/drive/v3/files/' + encodeURIComponent(id) + '?uploadType=media&fields=id,version', content2, 'text/plain; charset=UTF-8');
      var v2 = JSON.parse(r4.text).version;
      result(String(v2) !== String(created.version), 'Testdatei überschreiben', 'Version ' + created.version + ' → ' + v2 + ', ' + r4.ms + ' ms');

      var r5 = await call(token, 'GET', '/drive/v3/files/' + encodeURIComponent(id) + '?alt=media');
      result(r5.text === content2, 'Geänderte Datei lesen', r5.ms + ' ms');

      var r6 = await call(token, 'DELETE', '/drive/v3/files/' + encodeURIComponent(id));
      id = null;
      result(true, 'Testdatei löschen', r6.ms + ' ms');
      result(true, 'Gesamtergebnis', 'Google Drive ist auf diesem Gerät für die Synchronisation nutzbar');
    } catch (e) {
      result(false, 'Fehler', e.message + (e.ms != null ? ' nach ' + e.ms + ' ms' : ''));
      if (id) { try { await call(token, 'DELETE', '/drive/v3/files/' + encodeURIComponent(id)); } catch (e3) { /* Aufräumen nicht möglich */ } }
    }
    token = null;
    finish();
  }

  function explainError(code) {
    var map = {
      access_denied: 'Zugriff abgelehnt (Zustimmung nicht erteilt oder Konto nicht als Testnutzer eingetragen)',
      interaction_required: 'Erneuerung ohne Rückfrage nicht möglich – Google verlangt eine Bestätigung',
      login_required: 'Erneuerung ohne Rückfrage nicht möglich – bei Google nicht angemeldet',
      consent_required: 'Erneuerung ohne Rückfrage nicht möglich – Zustimmung erforderlich',
      state_mismatch: 'Rückkehr passt nicht zur Anmeldung (z. B. in einem anderen Fenster/Safari statt der Home-Bildschirm-App gelandet)',
      no_token: 'Kein Zugriffstoken erhalten'
    };
    return map[code] || code;
  }

  $('btnLogin').addEventListener('click', function () { startAuth('select_account'); });
  $('btnSilent').addEventListener('click', function () { startAuth('none'); });
  $('btnCopy').addEventListener('click', function () {
    var ta = $('summary');
    ta.select();
    var done = function () { $('btnCopy').textContent = 'Kopiert'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, function () { document.execCommand('copy'); done(); });
    else { document.execCommand('copy'); done(); }
  });

  showEnv();
  var ret = readReturn();
  if (ret && ret.error) { result(false, 'Anmeldung', explainError(ret.error)); finish(); }
  else if (ret && ret.token) { runTests(ret); }
})();
