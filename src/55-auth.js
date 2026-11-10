/* Wiedervorlage – Google-Anmeldung (OAuth 2.0, Weiterleitung, nur drive.appdata)
 * - Zugriffstoken (ca. 1 Stunde gültig) nur in sessionStorage dieses Fensters, nie in der Adresszeile
 *   (Fragment wird sofort entfernt), nie in Protokollen.
 * - Erneuerung ohne Rückfrage per prompt=none; Schleifenschutz bei wiederholten Fehlschlägen.
 */
(function (root) {
  'use strict';
  var WV = root.WV, D = WV.dates, u = WV.util;
  var A = WV.auth = {};
  A.SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  A.ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
  var TOKEN_KEY = 'wv-token', STATE_KEY = 'wv-oauth-state', LAST_TRY_KEY = 'wv-auth-last', SILENT_FAIL_KEY = 'wv-auth-silentfail';
  var memToken = null;

  function ss() { try { return root.sessionStorage; } catch (e) { return null; } }
  function ls() { try { return root.localStorage; } catch (e) { return null; } }

  A.clientId = function () { return (root.WV_CONFIG && root.WV_CONFIG.googleClientId) || ''; };
  // Nur in der gehosteten Fassung (HTTPS) bzw. lokal zum Testen; nicht als file://
  A.available = function () {
    if (!A.clientId()) return false;
    return root.location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(root.location.hostname);
  };
  A.redirectUri = function () { return new URL('./', root.location.href).href.split('#')[0].split('?')[0]; };

  A.token = function () {
    var t = memToken;
    if (!t) { try { t = JSON.parse((ss() && ss().getItem(TOKEN_KEY)) || 'null'); } catch (e) { t = null; } }
    if (!t || !t.v || !t.exp) return null;
    if (D.now().getTime() > t.exp - 120000) return null; // 2 Minuten Sicherheitsabstand
    memToken = t;
    return t.v;
  };
  A.expiresAt = function () {
    var t = memToken;
    if (!t) { try { t = JSON.parse((ss() && ss().getItem(TOKEN_KEY)) || 'null'); } catch (e) { t = null; } }
    return t && t.exp ? t.exp : null;
  };
  A.invalidate = function () {
    memToken = null;
    try { if (ss()) ss().removeItem(TOKEN_KEY); } catch (e) { /* ignorieren */ }
  };

  // Weiterleitung zu Google. prompt: 'none' (still), 'select_account' (Auswahl), 'consent'
  A.start = function (prompt, purpose) {
    var state = u.hex(u.randomBytes(16));
    try {
      if (ss()) ss().setItem(STATE_KEY, JSON.stringify({ s: state, p: prompt || '', purpose: purpose || '' }));
      if (ls()) ls().setItem(STATE_KEY, JSON.stringify({ s: state, p: prompt || '', purpose: purpose || '' }));
      if (ls()) ls().setItem(LAST_TRY_KEY, String(D.now().getTime()));
    } catch (e) { /* ohne Speicher keine Prüfung möglich → Rückkehr wird abgewiesen */ }
    var p = new URLSearchParams({
      client_id: A.clientId(), redirect_uri: A.redirectUri(), response_type: 'token',
      scope: A.SCOPE, state: state, include_granted_scopes: 'false'
    });
    if (prompt) p.set('prompt', prompt);
    root.location.assign(A.ENDPOINT + '?' + p.toString());
  };

  // Beim Start aufrufen: liest die Rückkehr von Google, entfernt das Fragment sofort aus der Adresszeile.
  // Rückgabe: null | { ok:true, purpose } | { error, prompt, purpose }
  A.handleReturn = function () {
    var hash = root.location.hash;
    if (!hash || hash.length < 2 || !/(access_token|error)=/.test(hash)) return null;
    var h = new URLSearchParams(hash.slice(1));
    try { root.history.replaceState(null, '', root.location.pathname + root.location.search); } catch (e) { root.location.hash = ''; }
    var saved = null;
    try {
      saved = JSON.parse((ss() && ss().getItem(STATE_KEY)) || (ls() && ls().getItem(STATE_KEY)) || 'null');
      if (ss()) ss().removeItem(STATE_KEY);
      if (ls()) ls().removeItem(STATE_KEY);
    } catch (e) { saved = null; }
    var prompt = saved ? saved.p : '', purpose = saved ? saved.purpose : '';
    if (!saved || h.get('state') !== saved.s) return { error: 'state_mismatch', prompt: prompt, purpose: purpose };
    if (h.get('error')) {
      if (prompt === 'none') { try { if (ss()) ss().setItem(SILENT_FAIL_KEY, h.get('error')); } catch (e) { /* ignorieren */ } }
      return { error: h.get('error'), prompt: prompt, purpose: purpose };
    }
    var scopes = (h.get('scope') || '').split(' ');
    if (scopes.indexOf(A.SCOPE) < 0) return { error: 'scope_missing', prompt: prompt, purpose: purpose };
    var tok = h.get('access_token');
    if (!tok) return { error: 'no_token', prompt: prompt, purpose: purpose };
    var exp = D.now().getTime() + Math.max(60, Number(h.get('expires_in') || 3600)) * 1000;
    memToken = { v: tok, exp: exp };
    try {
      if (ss()) { ss().setItem(TOKEN_KEY, JSON.stringify(memToken)); ss().removeItem(SILENT_FAIL_KEY); }
    } catch (e) { /* Token nur im Arbeitsspeicher */ }
    return { ok: true, prompt: prompt, purpose: purpose };
  };

  // Darf jetzt automatisch (still) verbunden werden? Schleifenschutz: höchstens alle 2 Minuten,
  // nach einem stillen Fehlschlag in diesem Fenster nicht erneut.
  A.mayAutoConnect = function () {
    try {
      if (ss() && ss().getItem(SILENT_FAIL_KEY)) return false;
      var last = Number((ls() && ls().getItem(LAST_TRY_KEY)) || 0);
      if (last && D.now().getTime() - last < 120000) return false;
    } catch (e) { return false; }
    return true;
  };
  A.silentFailed = function () { try { return (ss() && ss().getItem(SILENT_FAIL_KEY)) || null; } catch (e) { return null; } };

  A.errorText = function (code) {
    var map = {
      access_denied: 'Google-Zugriff wurde nicht erlaubt.',
      interaction_required: 'Google möchte die Anmeldung bestätigen.',
      login_required: 'Bei Google nicht angemeldet.',
      consent_required: 'Google möchte die Freigabe erneut bestätigen.',
      account_selection_required: 'Bitte das Google-Konto auswählen.',
      state_mismatch: 'Die Rückkehr von Google passte nicht zur Anmeldung. Bitte erneut versuchen.',
      scope_missing: 'Die nötige Berechtigung (App-Ordner) wurde nicht erteilt.',
      no_token: 'Von Google kam kein Zugriffsschlüssel.'
    };
    return map[code] || ('Anmeldung fehlgeschlagen (' + String(code).slice(0, 40) + ').');
  };

  // Erreichbarkeit von Google prüfen, ohne Daten zu senden (opake Antwort genügt)
  A.probe = function (ms) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve(false); } }, ms || 3000);
      try {
        fetch('https://www.googleapis.com/drive/v3/about?fields=kind', { mode: 'no-cors', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })
          .then(function () { if (!done) { done = true; clearTimeout(timer); resolve(true); } },
            function () { if (!done) { done = true; clearTimeout(timer); resolve(false); } });
      } catch (e) { if (!done) { done = true; clearTimeout(timer); resolve(false); } }
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
