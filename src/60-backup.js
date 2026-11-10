/* Wiedervorlage – lokale Sicherung
 * Bevorzugt: Ordner über die File System Access API (Chrome). Dort werden geschrieben
 *   Wiedervorlage_aktuell.json            – nach Änderungen (entprellt)
 *   Wiedervorlage_JJJJ-MM-TT_HH-MM.json   – höchstens eine pro Tag, die letzten 30 bleiben
 * Nach jedem Schreiben wird die Datei zurückgelesen, entschlüsselt und per Prüfsumme verglichen.
 * Fallback: Download / Laden von Hand.
 */
(function (root) {
  'use strict';
  var WV = root.WV, D = WV.dates, F = WV.format, C = WV.crypto, DB = WV.db, u = WV.util;
  var B = WV.backup = {};
  B.FILE_CURRENT = 'Wiedervorlage_aktuell.json';
  B.DATED_RE = /^Wiedervorlage_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.json$/;
  B.KEEP_DATED = 30;
  B.AUTO_DELAY = 10000;

  function fail(code, msg) { var e = new Error(msg); e.code = code; return e; }

  B.supportsFolder = function () { return typeof root.showDirectoryPicker === 'function'; };

  B.snapshot = async function () {
    var all = await DB.loadAll();
    return {
      seq: all.meta.changeSeq || 0,
      payload: {
        schema: WV.SCHEMA, exportedAt: D.isoNow(), sourceDevice: all.meta.device ? all.meta.device.id : null,
        tasks: all.tasks, patients: all.patients, local: all.local
      },
      counts: { tasks: all.tasks.length }
    };
  };

  async function writeFile(fh, text) {
    var w = await fh.createWritable();
    try {
      await w.write(new Blob([text], { type: 'application/json' }));
      await w.close();
    } catch (e) {
      try { await w.abort(); } catch (e2) { /* ignorieren */ }
      throw e;
    }
  }

  async function verifyFile(fh, key, hash) {
    var file = await fh.getFile();
    var text = await file.text();
    var header = F.parse(text);
    var dec = await F.decrypt(header, key);
    if (dec.hash !== hash) throw fail('VERIFY', 'Die geschriebene Sicherung stimmt nicht mit dem Datenbestand überein.');
  }

  async function prune(dir) {
    var names = [];
    if (!dir.entries) return;
    for await (var entry of dir.entries()) {
      if (entry[1].kind === 'file' && B.DATED_RE.test(entry[0])) names.push(entry[0]);
    }
    names.sort().reverse();
    for (var i = B.KEEP_DATED; i < names.length; i++) {
      try { await dir.removeEntry(names[i]); } catch (e) { /* nicht kritisch */ }
    }
  }

  B.permission = async function (dir, interactive) {
    if (!dir) return 'none';
    try {
      if (typeof dir.queryPermission !== 'function') return 'granted';
      var p = await dir.queryPermission({ mode: 'readwrite' });
      if (p === 'granted' || !interactive) return p;
      return await dir.requestPermission({ mode: 'readwrite' });
    } catch (e) {
      return 'denied';
    }
  };

  // Schreibt aktuelle und ggf. datierte Sicherung, prüft beide
  B.writeToFolder = async function (dir, enc, key, lastDatedDay) {
    var fh = await dir.getFileHandle(B.FILE_CURRENT, { create: true });
    await writeFile(fh, enc.text);
    await verifyFile(fh, key, enc.hash);
    var dated = null;
    var today = D.today();
    if (lastDatedDay !== today) {
      dated = 'Wiedervorlage_' + D.fileStamp() + '.json';
      var fh2 = await dir.getFileHandle(dated, { create: true });
      await writeFile(fh2, enc.text);
      await verifyFile(fh2, key, enc.hash);
      await prune(dir);
    }
    return { dated: dated, day: today };
  };

  B.readFromFolder = async function (dir) {
    try {
      var fh = await dir.getFileHandle(B.FILE_CURRENT);
      return { name: B.FILE_CURRENT, text: await (await fh.getFile()).text() };
    } catch (e) { /* Datei fehlt → jüngste datierte Sicherung */ }
    var names = [];
    for await (var entry of dir.entries()) {
      if (entry[1].kind === 'file' && B.DATED_RE.test(entry[0])) names.push(entry[0]);
    }
    names.sort().reverse();
    if (!names.length) throw fail('NOFILE', 'In diesem Ordner wurde keine Wiedervorlage-Sicherung gefunden.');
    var h = await dir.getFileHandle(names[0]);
    return { name: names[0], text: await (await h.getFile()).text() };
  };

  B.fileName = function () { return 'Wiedervorlage_' + D.fileStamp() + '.json'; };

  B.triggerDownload = function (text, name) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 2000);
  };

  // ---------- Steuerung ----------
  var Ctl = WV.backupCtl = {
    key: null, keyInfo: null, dir: null, perm: 'none', bs: {}, changeSeq: 0, busy: false,
    onStatus: null
  };

  function emit() { if (Ctl.onStatus) Ctl.onStatus(); }

  Ctl.init = async function () {
    var k = await DB.getMeta('key');
    if (k && k.key && k.info) { Ctl.key = k.key; Ctl.keyInfo = k.info; }
    Ctl.dir = (await DB.getMeta('backupDir')) || null;
    Ctl.bs = (await DB.getMeta('backupState')) || {};
    Ctl.changeSeq = (await DB.getMeta('changeSeq')) || 0;
    Ctl.perm = Ctl.dir ? await B.permission(Ctl.dir, false) : 'none';
    emit();
  };

  Ctl.refresh = async function () {
    Ctl.bs = (await DB.getMeta('backupState')) || {};
    Ctl.changeSeq = (await DB.getMeta('changeSeq')) || 0;
    var k = await DB.getMeta('key');
    if (k && k.key && k.info) { Ctl.key = k.key; Ctl.keyInfo = k.info; }
    emit();
  };

  Ctl.dirty = function () { return Ctl.changeSeq > (Ctl.bs.lastOkSeq || 0); };

  // Status für Kopfzeile: level ok | warn | error | info
  Ctl.status = function () {
    var bs = Ctl.bs || {};
    var unbackedOld = bs.firstUnbackedAt && Ctl.dirty() && (D.now().getTime() - new Date(bs.firstUnbackedAt).getTime() > 24 * 3600 * 1000);
    if (!Ctl.key) return { level: Ctl.changeSeq > 0 ? 'warn' : 'info', text: 'Sicherung einrichten', code: 'nokey', unbackedOld: unbackedOld };
    // Erfolgreiche Sicherungen löschen lastError → ist er gesetzt, war der letzte Versuch fehlerhaft
    if (bs.lastError) return { level: 'error', text: 'Sicherung fehlgeschlagen', code: 'error', unbackedOld: unbackedOld };
    if (Ctl.dir && Ctl.perm !== 'granted') return { level: 'warn', text: 'Sicherung wieder verbinden', code: 'reconnect', unbackedOld: unbackedOld };
    if (Ctl.busy) return { level: 'info', text: 'Sicherung läuft …', code: 'busy', unbackedOld: unbackedOld };
    if (Ctl.dirty()) {
      return { level: unbackedOld ? 'warn' : 'info', text: Ctl.dir ? 'Änderungen werden gesichert' : 'Ungesicherte Änderungen', code: 'dirty', unbackedOld: unbackedOld };
    }
    if (bs.lastOkAt) return { level: 'ok', text: 'Gesichert ' + D.fmtDateTime(bs.lastOkAt).slice(-5), code: 'ok', unbackedOld: false };
    return { level: 'info', text: 'Noch keine Sicherung', code: 'none', unbackedOld: false };
  };

  var timer = null;
  Ctl.noteChange = function (seq) {
    if (typeof seq === 'number') Ctl.changeSeq = Math.max(Ctl.changeSeq, seq);
    emit();
    if (!Ctl.key || !Ctl.dir) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; Ctl.runAuto(); }, B.AUTO_DELAY);
  };

  Ctl.flush = function () {
    if (timer) { clearTimeout(timer); timer = null; Ctl.runAuto(); }
  };

  Ctl.runAuto = async function () {
    if (!Ctl.key || !Ctl.dir || Ctl.busy) return;
    if (!Ctl.dirty()) return;
    Ctl.perm = await B.permission(Ctl.dir, false);
    if (Ctl.perm !== 'granted') { emit(); return; }
    await Ctl.writeNow();
  };

  async function recordError(e) {
    var msg = (e && e.code === 'VERIFY') ? e.message :
      (e && e.name === 'NotAllowedError') ? 'Kein Schreibzugriff auf den Sicherungsordner.' :
      (e && e.name === 'NotFoundError') ? 'Sicherungsordner nicht gefunden (Laufwerk nicht verbunden?).' :
      (e && e.name === 'QuotaExceededError') ? 'Kein Speicherplatz für die Sicherung.' :
      'Sicherung konnte nicht geschrieben werden.';
    Ctl.bs = await DB.updateMeta('backupState', function (bs) {
      bs = bs || {};
      bs.lastError = msg; bs.lastErrorAt = D.isoNow();
      return bs;
    });
    emit();
    return msg;
  }

  // Schreibt in den Ordner; liefert {ok, message}
  Ctl.writeNow = async function (interactive) {
    if (!Ctl.key) return { ok: false, message: 'Zuerst eine Passphrase für die Sicherung festlegen.' };
    if (!Ctl.dir) return { ok: false, message: 'Kein Sicherungsordner gewählt.' };
    if (Ctl.busy) return { ok: false, message: 'Sicherung läuft bereits.' };
    Ctl.perm = await B.permission(Ctl.dir, !!interactive);
    if (Ctl.perm !== 'granted') { emit(); return { ok: false, message: 'Kein Zugriff auf den Sicherungsordner. Bitte „Wieder verbinden“ wählen.' }; }
    Ctl.busy = true; emit();
    try {
      var snap = await B.snapshot();
      var enc = await F.encode(snap.payload, Ctl.key, Ctl.keyInfo);
      var res = await B.writeToFolder(Ctl.dir, enc, Ctl.key, Ctl.bs.lastDatedDay);
      var patch = { lastOkAt: D.isoNow(), lastOkKind: 'folder', lastError: null, lastErrorAt: null, folderName: Ctl.dir.name || '' };
      if (res.dated) patch.lastDatedDay = res.day;
      var fin = await DB.finishBackup(snap.seq, patch);
      Ctl.bs = fin.bs; Ctl.changeSeq = fin.changeSeq;
      return { ok: true, message: 'Sicherung geschrieben und geprüft.' };
    } catch (e) {
      return { ok: false, message: await recordError(e) };
    } finally {
      Ctl.busy = false; emit();
    }
  };

  Ctl.connectFolder = async function () {
    if (!B.supportsFolder()) return { ok: false, message: 'Dieser Browser unterstützt keine Ordner-Sicherung. Bitte „Sicherung herunterladen“ verwenden.' };
    var dir;
    try {
      dir = await root.showDirectoryPicker({ id: 'wiedervorlage', mode: 'readwrite', startIn: 'documents' });
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, message: null };
      return { ok: false, message: 'Dieser Ordner kann nicht verwendet werden. Bitte einen eigenen Unterordner wählen (z. B. „Wiedervorlage-Sicherung“).' };
    }
    Ctl.dir = dir;
    await DB.setMeta('backupDir', dir);
    Ctl.perm = await B.permission(dir, true);
    Ctl.bs = await DB.updateMeta('backupState', function (bs) { bs = bs || {}; bs.folderName = dir.name || ''; bs.lastDatedDay = null; return bs; });
    emit();
    if (Ctl.key) return Ctl.writeNow(true);
    return { ok: true, message: 'Ordner gewählt. Für die Sicherung bitte noch eine Passphrase festlegen.' };
  };

  Ctl.disconnectFolder = async function () {
    Ctl.dir = null; Ctl.perm = 'none';
    await DB.setMeta('backupDir', null);
    emit();
  };

  Ctl.reconnect = async function () {
    if (!Ctl.dir) return { ok: false, message: 'Kein Sicherungsordner gewählt.' };
    Ctl.perm = await B.permission(Ctl.dir, true);
    emit();
    if (Ctl.perm !== 'granted') return { ok: false, message: 'Zugriff wurde nicht erlaubt.' };
    if (Ctl.dirty() || !Ctl.bs.lastOkAt) return Ctl.writeNow(true);
    return { ok: true, message: 'Sicherungsordner wieder verbunden.' };
  };

  // Download (Fallback und zusätzlich jederzeit möglich). Inhalt wird vorher geprüft.
  Ctl.download = async function () {
    if (!Ctl.key) return { ok: false, message: 'Zuerst eine Passphrase für die Sicherung festlegen.' };
    try {
      var snap = await B.snapshot();
      var enc = await F.encode(snap.payload, Ctl.key, Ctl.keyInfo);
      var dec = await F.decrypt(F.parse(enc.text), Ctl.key);
      if (dec.hash !== enc.hash) throw fail('VERIFY', 'Prüfung der Sicherungsdatei fehlgeschlagen.');
      B.triggerDownload(enc.text, B.fileName());
      var fin = await DB.finishBackup(snap.seq, { lastOkAt: D.isoNow(), lastOkKind: 'download', lastError: null, lastErrorAt: null });
      Ctl.bs = fin.bs; Ctl.changeSeq = fin.changeSeq;
      emit();
      return { ok: true, message: 'Sicherungsdatei geprüft und zum Herunterladen übergeben. Bitte an einem sicheren Ort speichern.' };
    } catch (e) {
      return { ok: false, message: await recordError(e) };
    }
  };

  Ctl.setupKey = async function (pass) {
    var k = await C.createKey(pass);
    await DB.setMeta('key', { info: k.info, key: k.key });
    Ctl.key = k.key; Ctl.keyInfo = k.info;
    // Neue Passphrase → am selben Tag zusätzlich eine datierte Sicherung mit neuem Schlüssel
    Ctl.bs = await DB.updateMeta('backupState', function (bs) { bs = bs || {}; bs.lastDatedDay = null; bs.lastOkSeq = 0; return bs; });
    emit();
    if (Ctl.dir) return Ctl.writeNow(true);
    return { ok: true, message: null };
  };

  Ctl.adoptKey = async function (info, key) {
    await DB.setMeta('key', { info: info, key: key });
    Ctl.key = key; Ctl.keyInfo = info;
    emit();
  };

  // ---------- Import ----------
  // Liest eine Sicherungsdatei; entsperrt mit lokalem Schlüssel oder Passphrase
  B.openFile = async function (text, passphrase) {
    var header = F.parse(text);
    var key = null, usedLocal = false;
    if (!passphrase && Ctl.key && Ctl.keyInfo && Ctl.keyInfo.keyId === header.key.keyId) {
      key = Ctl.key; usedLocal = true;
    } else if (passphrase) {
      key = await C.unlock(header.key, passphrase);
    } else {
      throw fail('NEED_PASSPHRASE', 'Für diese Sicherung wird die Passphrase benötigt.');
    }
    var dec = await F.decrypt(header, key);
    return { header: header, key: key, usedLocal: usedLocal, payload: dec.payload };
  };

  B.preview = function (state, payload) {
    var res = WV.merge.mergeSets(state, payload, true);
    var openCount = 0, doneCount = 0;
    payload.tasks.forEach(function (t) {
      if (t.v.purged || t.v.deleted) return;
      if (t.v.status === 'done') doneCount++; else openCount++;
    });
    return { stats: res.stats, samples: res.samples, totals: { open: openCount, done: doneCount, patients: payload.patients.length, skipped: payload.skipped || 0 } };
  };

  // Führt die Sicherung in einer Transaktion zusammen (gegen den aktuellen Stand in der Datenbank)
  B.apply = async function (payload) {
    var ids = {
      tasks: payload.tasks.map(function (t) { return t.id; }),
      patients: payload.patients.map(function (p) { return p.id; }),
      local: payload.local.map(function (l) { return l.id; })
    };
    var stats = null;
    var out = await DB.mutate(ids, function (cur) {
      var toMap = function (o) { var m = new Map(); Object.keys(o).forEach(function (k) { if (o[k]) m.set(k, o[k]); }); return m; };
      var res = WV.merge.mergeSets({ tasks: toMap(cur.tasks), patients: toMap(cur.patients), local: toMap(cur.local) }, payload, true);
      stats = res.stats;
      var changed = res.tasks.length + res.patients.length + res.local.length > 0;
      return { tasks: res.tasks, patients: res.patients, local: res.local, dirty: changed, stamp: false };
    });
    return { stats: stats, records: out };
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
