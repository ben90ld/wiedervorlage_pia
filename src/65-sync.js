/* Wiedervorlage – Synchronisation über den App-Ordner in Google Drive
 *
 * Ablage (alle Inhalte Ende-zu-Ende-verschlüsselt, nur Dateinamen/Größe/Zeitpunkte für Google sichtbar):
 *   wv-keys.json          Salt, Iterationen, mit der Passphrase verpackter Datenschlüssel (kein Klartext-Inhalt)
 *   wv-dev-<gerät>.json   vollständiger, verschlüsselter Stand eines Geräts – ohne Notizen/lokale Felder
 * Jedes Gerät schreibt nur seine eigene Datei und liest die der anderen. Dadurch kann kein Upload eines
 * Geräts die Daten eines anderen überschreiben. Zusammengeführt wird lokal, feldweise (siehe 30-merge.js).
 */
(function (root) {
  'use strict';
  var WV = root.WV, D = WV.dates, F = WV.format, C = WV.crypto, DB = WV.db, G = WV.drive, A = WV.auth, Ctl = WV.backupCtl, M = WV.model;
  var S = WV.sync = {};
  S.KEYS_NAME = 'wv-keys.json';
  S.KEYS_FORMAT = 'wiedervorlage-keys';
  S.DEV_RE = /^wv-dev-([a-z0-9]{6,24})\.json$/;
  S.UPLOAD_DELAY = 4000;
  S.PERIOD = 5 * 60 * 1000;
  S.onStatus = null;   // Statusänderung
  S.onMerged = null;   // fremde Änderungen übernommen
  S.onNeedKey = null;  // Passphrase der Synchronisation nötig

  var st = S.st = { cfg: null, deviceId: null, running: false, again: false, needKey: null, skipped: 0 };

  function fail(code, msg) { var e = new Error(msg); e.code = code; return e; }
  function emit() { if (S.onStatus) S.onStatus(); }

  S.devName = function (id) { return 'wv-dev-' + id + '.json'; };

  S.deviceLabel = function () {
    var ua = root.navigator.userAgent;
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua) || (root.navigator.platform === 'MacIntel' && root.navigator.maxTouchPoints > 1)) return 'iPad';
    if (/Android/.test(ua)) return 'Android-Gerät';
    if (/Windows/.test(ua)) return 'Windows-PC';
    if (/Mac/.test(ua)) return 'Mac';
    return 'Gerät';
  };

  S.init = async function () {
    st.cfg = (await DB.getMeta('sync')) || null;
    var dev = await DB.getMeta('device');
    st.deviceId = dev ? dev.id : null;
    emit();
  };

  async function saveCfg() { await DB.setMeta('sync', st.cfg); }
  async function reloadCfg() { st.cfg = (await DB.getMeta('sync')) || st.cfg; }

  S.enabled = function () { return !!(st.cfg && st.cfg.enabled); };
  S.cfg = function () { return st.cfg || {}; };
  S.pending = function () { return S.enabled() && Ctl.changeSeq > (st.cfg.uploadedSeq || 0); };

  // Status für die Kopfzeile: code ok | pending | running | offline | auth | key | error | off | unavailable
  S.status = function () {
    if (!A.available()) return { code: 'unavailable', level: 'info', text: 'Synchronisation nur in der Online-Version' };
    if (!S.enabled()) return { code: 'off', level: 'info', text: 'Synchronisation nicht eingerichtet' };
    if (st.needKey) return { code: 'key', level: 'warn', text: 'Passphrase nötig' };
    if (st.running) return { code: 'running', level: 'info', text: 'Synchronisiere …' };
    if (!root.navigator.onLine) return { code: 'offline', level: 'info', text: S.pending() ? 'Offline – Änderungen warten' : 'Offline' };
    var c = st.cfg;
    if (c.lastError && c.lastError.code !== 'AUTH') return { code: 'error', level: 'error', text: 'Synchronisation fehlgeschlagen' };
    if (!A.token()) return { code: 'auth', level: S.pending() ? 'warn' : 'info', text: S.pending() ? 'Änderungen warten – verbinden' : 'Mit Google verbinden' };
    if (S.pending()) return { code: 'pending', level: 'info', text: 'Änderungen warten auf Übertragung' };
    return { code: 'ok', level: 'ok', text: c.lastSyncAt ? 'Synchronisiert ' + D.fmtDateTime(c.lastSyncAt).slice(-5) : 'Verbunden' };
  };

  // ---------- Schlüsseldatei ----------
  S.keysText = function (info) {
    return JSON.stringify({ format: S.KEYS_FORMAT, formatVersion: 1, createdAt: D.isoNow(), key: info });
  };
  S.parseKeys = function (text) {
    var o;
    try { o = JSON.parse(text); } catch (e) { throw fail('FORMAT', 'Schlüsseldatei in Google Drive ist beschädigt.'); }
    if (!o || o.format !== S.KEYS_FORMAT || !C.validKeyInfo(o.key)) throw fail('FORMAT', 'Schlüsseldatei in Google Drive ist ungültig.');
    return o.key;
  };
  function byCreated(a, b) {
    var x = a.createdTime || '', y = b.createdTime || '';
    return x < y ? -1 : (x > y ? 1 : (a.id < b.id ? -1 : 1));
  }

  // ---------- Stand dieses Geräts (ohne lokale Felder) ----------
  S.snapshot = async function () {
    var all = await DB.loadAll();
    var body = { tasks: all.tasks, patients: all.patients };
    return {
      seq: all.meta.changeSeq || 0,
      hash: await C.sha256Hex(JSON.stringify(body)),
      payload: {
        schema: WV.SCHEMA, exportedAt: D.isoNow(), sourceDevice: st.deviceId,
        device: { id: st.deviceId, label: S.deviceLabel() },
        tasks: all.tasks, patients: all.patients
      }
    };
  };

  // Fremden Stand einmischen – lokale Felder (Notizen) werden nie angefasst
  S.applyRemote = async function (payload) {
    var ids = {
      tasks: payload.tasks.map(function (t) { return t.id; }),
      patients: payload.patients.map(function (p) { return p.id; })
    };
    var stats = null, changed = false;
    var out = await DB.mutate(ids, function (cur) {
      var toMap = function (o) { var m = new Map(); Object.keys(o).forEach(function (k) { if (o[k]) m.set(k, o[k]); }); return m; };
      var res = WV.merge.mergeSets({ tasks: toMap(cur.tasks), patients: toMap(cur.patients), local: new Map() },
        { tasks: payload.tasks, patients: payload.patients, local: [] }, false);
      stats = res.stats;
      changed = res.tasks.length + res.patients.length > 0;
      return { tasks: res.tasks, patients: res.patients, local: [], dirty: changed, stamp: false };
    });
    if (out && typeof out.changeSeq === 'number') Ctl.noteChange(out.changeSeq);
    return { stats: stats, changed: changed };
  };

  function withLock(fn) {
    if (root.navigator.locks && typeof root.navigator.locks.request === 'function') {
      return root.navigator.locks.request('wiedervorlage-sync', fn);
    }
    return fn();
  }

  // ---------- Ein Abgleich ----------
  async function run(token) {
    await reloadCfg();
    var cfg = st.cfg;
    var files = await G.list(token);

    // 1. Schlüssel abgleichen
    var keyFiles = files.filter(function (f) { return f.name === S.KEYS_NAME; }).sort(byCreated);
    if (cfg.keyPendingUpload || !keyFiles.length) {
      if (keyFiles.length) await G.update(token, keyFiles[0].id, S.keysText(Ctl.keyInfo));
      else keyFiles = [await G.create(token, S.KEYS_NAME, S.keysText(Ctl.keyInfo))];
      cfg.keyPendingUpload = false;
      cfg.keysFileId = keyFiles[0].id;
      cfg.uploadedHash = null; // eigene Datei mit aktuellem Schlüssel neu schreiben
    } else {
      var kf = keyFiles[0];
      if (cfg.keysFileId !== kf.id || cfg.keysVersion !== kf.version || cfg.keysKeyId !== Ctl.keyInfo.keyId) {
        var info = S.parseKeys(await G.download(token, kf.id));
        if (info.keyId !== Ctl.keyInfo.keyId) {
          st.needKey = { info: info };
          if (S.onNeedKey) S.onNeedKey(st.needKey);
          throw fail('KEY', 'In Google Drive gilt eine andere Passphrase.');
        }
        cfg.keysFileId = kf.id; cfg.keysVersion = kf.version; cfg.keysKeyId = info.keyId;
      }
      for (var i = 1; i < keyFiles.length; i++) { try { await G.remove(token, keyFiles[i].id); } catch (e) { /* nicht kritisch */ } }
    }

    // 2. Stände der anderen Geräte einlesen
    var seen = cfg.seen || {}, others = cfg.others || {};
    var stats = { tasksNew: 0, tasksUpdated: 0, conflicts: 0, files: 0 };
    var own = null, ownDupes = [], present = {};
    st.skipped = 0;
    for (var j = 0; j < files.length; j++) {
      var f = files[j];
      var m = S.DEV_RE.exec(f.name);
      if (!m) continue;
      present[f.id] = true;
      if (m[1] === st.deviceId) {
        if (!own) own = f;
        else if (f.id === cfg.ownFileId) { ownDupes.push(own); own = f; }
        else ownDupes.push(f);
        continue;
      }
      if (seen[f.id] === f.version) continue;
      var text = await G.download(token, f.id);
      var h;
      try { h = F.parse(text, F.SYNC_FORMAT); } catch (e) { st.skipped++; continue; }
      if (h.key.keyId !== Ctl.keyInfo.keyId) { st.skipped++; continue; } // Gerät mit älterem Schlüssel – später erneut
      var dec = await F.decrypt(h, Ctl.key);
      var r = await S.applyRemote(dec.payload);
      stats.tasksNew += r.stats.tasksNew; stats.tasksUpdated += r.stats.tasksUpdated; stats.conflicts += r.stats.conflicts; stats.files++;
      seen[f.id] = f.version;
      var dp = dec.payload.device || {};
      others[m[1]] = { label: dp.label || 'anderes Gerät', exportedAt: dec.payload.exportedAt || null, at: D.isoNow() };
    }
    Object.keys(seen).forEach(function (id) { if (!present[id]) delete seen[id]; });

    // 3. Eigenen Stand hochladen, wenn er sich geändert hat
    var snap = await S.snapshot();
    if (!own || snap.hash !== cfg.uploadedHash || own.version !== cfg.ownVersion) {
      var enc = await F.encode(snap.payload, Ctl.key, Ctl.keyInfo, F.SYNC_FORMAT);
      var meta;
      if (own) {
        try { meta = await G.update(token, own.id, enc.text); }
        catch (e) { if (e.code === 'NOTFOUND') meta = await G.create(token, S.devName(st.deviceId), enc.text); else throw e; }
      } else {
        meta = await G.create(token, S.devName(st.deviceId), enc.text);
      }
      cfg.ownFileId = meta.id; cfg.ownVersion = meta.version; cfg.uploadedHash = snap.hash;
    }
    for (var k = 0; k < ownDupes.length; k++) { try { await G.remove(token, ownDupes[k].id); } catch (e) { /* nicht kritisch */ } }
    cfg.uploadedSeq = Math.max(cfg.uploadedSeq || 0, snap.seq);
    cfg.seen = seen; cfg.others = others;
    cfg.lastSyncAt = D.isoNow();
    cfg.lastError = null;
    await saveCfg();
    return stats;
  }

  // Öffentlicher Abgleich. Läuft bereits einer, wird danach genau ein weiterer angehängt
  // (der Aufrufer erhält dessen Ergebnis). Rückgabe: { ok, code?, message?, stats? }
  var current = null, next = null;
  S.syncNow = function () {
    if (current) {
      if (!next) next = current.then(function () { next = null; return S.syncNow(); });
      return next;
    }
    current = doSync();
    current.then(function () { current = null; }, function () { current = null; });
    return current;
  };

  async function doSync() {
    if (!S.enabled()) return { ok: false, code: 'off' };
    if (st.needKey) { emit(); return { ok: false, code: 'KEY' }; }
    if (!root.navigator.onLine) { emit(); return { ok: false, code: 'offline' }; }
    var token = A.token();
    if (!token) { emit(); return { ok: false, code: 'auth' }; }
    if (!Ctl.key || !Ctl.keyInfo) { st.needKey = { info: null }; emit(); return { ok: false, code: 'KEY' }; }
    st.running = true; emit();
    try {
      var stats = await withLock(function () { return run(token); });
      // Oberfläche aktualisieren, bevor der Abgleich als abgeschlossen gilt
      if (stats.files && (stats.tasksNew || stats.tasksUpdated || stats.conflicts) && S.onMerged) await S.onMerged(stats);
      return { ok: true, stats: stats };
    } catch (e) {
      if (e.code === 'AUTH') A.invalidate();
      await reloadCfg();
      if (e.code !== 'KEY') {
        st.cfg.lastError = { code: e.code || 'ERR', message: e.code === 'AUTH' ? 'Google-Anmeldung abgelaufen.' : (e.message || 'Unbekannter Fehler'), at: D.isoNow() };
        await saveCfg();
      }
      return { ok: false, code: e.code || 'ERR', message: e.message };
    } finally {
      st.running = false;
      emit();
    }
  }

  var timer = null;
  S.schedule = function (ms) {
    if (!S.enabled()) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; S.syncNow(); }, ms === undefined ? S.UPLOAD_DELAY : ms);
  };
  S.noteChange = function () { if (S.enabled() && A.token()) S.schedule(); else emit(); };

  // ---------- Einrichtung ----------
  S.beginSetup = function () { A.start('select_account', 'setup'); };

  // Nach der Rückkehr von Google: Rückgabe { done } | { need:'create' } | { need:'unlock', info, hadLocalKey }
  S.continueSetup = async function () {
    var token = A.token();
    if (!token) throw fail('AUTH', 'Google-Anmeldung fehlt.');
    var files = await G.list(token);
    var keyFiles = files.filter(function (f) { return f.name === S.KEYS_NAME; }).sort(byCreated);
    if (keyFiles.length) {
      var info = S.parseKeys(await G.download(token, keyFiles[0].id));
      if (Ctl.keyInfo && Ctl.keyInfo.keyId === info.keyId && Ctl.key) {
        await S.enable();
        return { done: true };
      }
      return { need: 'unlock', info: info, hadLocalKey: !!Ctl.key };
    }
    if (Ctl.key && Ctl.keyInfo) {
      await S.enable({ keyPendingUpload: true });
      return { done: true, usedExisting: true };
    }
    return { need: 'create' };
  };

  S.enable = async function (extra) {
    st.cfg = Object.assign({
      enabled: true, setupAt: D.isoNow(), autoConnect: true, uploadedSeq: 0, uploadedHash: null,
      seen: {}, others: {}, lastSyncAt: null, lastError: null, keyPendingUpload: false
    }, st.cfg && !st.cfg.enabled ? { autoConnect: st.cfg.autoConnect !== false } : {}, extra || {});
    st.needKey = null;
    await saveCfg();
    emit();
  };

  S.disable = async function () {
    if (!st.cfg) return;
    st.cfg.enabled = false;
    await saveCfg();
    A.invalidate();
    emit();
  };

  S.setAutoConnect = async function (on) {
    if (!st.cfg) return;
    st.cfg.autoConnect = !!on;
    await saveCfg();
  };

  // Passphrase eines anderen Geräts übernehmen (Schlüssel aus Google Drive)
  S.unlockWith = async function (pass, info) {
    var key = await C.unlock(info, pass); // wirft WRONG_PASSPHRASE
    await Ctl.adoptKey(info, key);
    // Sicherungen künftig mit diesem Schlüssel: frische Sicherung erzwingen
    Ctl.bs = await DB.updateMeta('backupState', function (bs) { bs = bs || {}; bs.lastOkSeq = 0; bs.lastDatedDay = null; return bs; });
    if (!S.enabled()) await S.enable();
    st.cfg.keysKeyId = info.keyId; st.cfg.keysVersion = null; st.cfg.uploadedHash = null; st.cfg.seen = {};
    st.needKey = null;
    await saveCfg();
    emit();
    Ctl.noteChange();
  };

  // Nach "Neue Passphrase festlegen" auf diesem Gerät: Schlüsseldatei ersetzen, alles neu verschlüsseln
  S.onKeyChanged = async function () {
    if (!S.enabled()) return;
    st.cfg.keyPendingUpload = true; st.cfg.uploadedHash = null; st.cfg.seen = {};
    st.needKey = null;
    await saveCfg();
    emit();
  };

  S.needKey = function () { return st.needKey; };
  S.skipped = function () { return st.skipped; };
})(typeof globalThis !== 'undefined' ? globalThis : self);
