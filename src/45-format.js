/* Wiedervorlage – Sicherungsformat (versioniert, verschlüsselt)
 *
 * Datei (JSON):
 * { format:"wiedervorlage-backup", formatVersion:1, appVersion, createdAt,
 *   key:{ keyId, kdf:{name,hash,iterations,salt}, wrapped:{iv,data} },   ← mit Passphrase entsperrbar
 *   payload:{ alg:"AES-GCM", compression:"gzip"|"none", iv, data } }      ← verschlüsselter Inhalt
 * Inhalt (entschlüsselt): { schema, exportedAt, sourceDevice, tasks:[], patients:[], local:[] }
 * Die Datei ist eigenständig: Wiederherstellung nur mit Datei + Passphrase, ohne Google.
 */
(function (root) {
  'use strict';
  var WV = root.WV, C = WV.crypto, D = WV.dates, M = WV.model;
  var F = WV.format = {};
  F.FORMAT = 'wiedervorlage-backup';
  F.VERSION = 1;

  function fail(code, msg) { var e = new Error(msg); e.code = code; return e; }

  F.aad = function (h) {
    return JSON.stringify([h.format, h.formatVersion, h.createdAt, h.key.keyId, h.payload.compression]);
  };

  F.SYNC_FORMAT = 'wiedervorlage-sync';

  // fmt: Dateiart ('wiedervorlage-backup' oder 'wiedervorlage-sync'); fließt in die Zusatzdaten ein
  F.encode = async function (payload, key, keyInfo, fmt) {
    var text = JSON.stringify(payload);
    var hash = await C.sha256Hex(text);
    var bytes = C.encodeText(text);
    var compression = 'none';
    if (C.canCompress()) { bytes = await C.gzip(bytes); compression = 'gzip'; }
    var header = {
      format: fmt || F.FORMAT, formatVersion: F.VERSION, appVersion: WV.VERSION, createdAt: D.isoNow(),
      key: keyInfo, payload: { alg: 'AES-GCM', compression: compression, iv: '', data: '' }
    };
    var sealed = await C.seal(key, bytes, F.aad(header));
    header.payload.iv = sealed.iv;
    header.payload.data = sealed.data;
    return { text: JSON.stringify(header), hash: hash, header: header };
  };

  // Prüft die äußere Struktur, ohne zu entschlüsseln
  F.parse = function (text, fmt) {
    var h;
    try { h = JSON.parse(text); } catch (e) { throw fail('FORMAT', 'Die Datei ist keine gültige Sicherung (kein JSON).'); }
    if (!h || h.format !== (fmt || F.FORMAT)) throw fail('FORMAT', 'Die Datei ist keine Wiedervorlage-Sicherung.');
    if (typeof h.formatVersion !== 'number') throw fail('FORMAT', 'Formatversion fehlt.');
    if (h.formatVersion > F.VERSION) throw fail('NEWER', 'Die Sicherung stammt aus einer neueren Programmversion. Bitte zuerst die App aktualisieren.');
    if (!C.validKeyInfo(h.key)) throw fail('FORMAT', 'Schlüsselangaben der Sicherung sind unvollständig.');
    var p = h.payload;
    if (!p || p.alg !== 'AES-GCM' || (p.compression !== 'gzip' && p.compression !== 'none') ||
      typeof p.iv !== 'string' || typeof p.data !== 'string') throw fail('FORMAT', 'Inhalt der Sicherung ist unvollständig.');
    if (p.compression === 'gzip' && !C.canCompress()) throw fail('UNSUPPORTED', 'Dieser Browser kann die komprimierte Sicherung nicht lesen.');
    return h;
  };

  F.decrypt = async function (header, key) {
    var bytes = await C.open(key, header.payload.iv, header.payload.data, F.aad(header));
    if (header.payload.compression === 'gzip') bytes = await C.gunzip(bytes);
    var text = C.decodeText(bytes);
    var obj;
    try { obj = JSON.parse(text); } catch (e) { throw fail('FORMAT', 'Inhalt der Sicherung ist beschädigt.'); }
    return { payload: F.migrate(obj), hash: await C.sha256Hex(text) };
  };

  // Migrationen: schema n → n+1. Neue Programmversionen ergänzen hier Funktionen,
  // damit ältere Sicherungen importierbar bleiben.
  F.migrations = {};

  F.migrate = function (p) {
    if (!p || typeof p.schema !== 'number') throw fail('FORMAT', 'Datenschema der Sicherung fehlt.');
    if (p.schema > WV.SCHEMA) throw fail('NEWER', 'Die Sicherung stammt aus einer neueren Programmversion.');
    while (p.schema < WV.SCHEMA) {
      var fn = F.migrations[p.schema];
      if (!fn) throw fail('FORMAT', 'Für Datenschema ' + p.schema + ' ist keine Umwandlung vorhanden.');
      p = fn(p);
    }
    return F.sanitize(p);
  };

  function isObj(o) { return o !== null && typeof o === 'object' && !Array.isArray(o); }
  function validDots(m) {
    if (!isObj(m)) return false;
    return Object.keys(m).every(function (k) {
      var d = m[k];
      return Array.isArray(d) && typeof d[0] === 'string' && typeof d[1] === 'number' && typeof d[2] === 'string';
    });
  }
  function validVv(vv) {
    return isObj(vv) && Object.keys(vv).every(function (k) { return typeof vv[k] === 'number'; });
  }
  function validBase(r) {
    return isObj(r) && typeof r.id === 'string' && r.id.length > 0 && r.id.length <= 64 &&
      isObj(r.v) && validDots(r.m) && validVv(r.vv) && (r.cf === undefined || isObj(r.cf));
  }

  F.validTask = function (r) {
    if (!validBase(r)) return false;
    var v = r.v;
    if (typeof v.title !== 'string' && !v.purged) return false;
    if (v.recall != null && !D.isValid(v.recall)) return false;
    if (v.deadline != null && !D.isValid(v.deadline)) return false;
    if (v.status != null && M.STATUS.indexOf(v.status) < 0) return false;
    if (r.pp !== undefined && !isObj(r.pp)) return false;
    return true;
  };
  F.validPatient = function (r) {
    return validBase(r) && (typeof r.v.label === 'string');
  };
  F.validLocal = function (r) {
    return isObj(r) && typeof r.id === 'string' && (r.note == null || typeof r.note === 'string') &&
      (r.nextStep == null || typeof r.nextStep === 'string');
  };

  F.sanitize = function (p) {
    var dev = null;
    if (isObj(p.device) && typeof p.device.id === 'string') {
      dev = { id: p.device.id.slice(0, 32), label: typeof p.device.label === 'string' ? p.device.label.slice(0, 40) : '' };
    }
    var out = { schema: p.schema, exportedAt: p.exportedAt || null, sourceDevice: p.sourceDevice || null, device: dev, tasks: [], patients: [], local: [], skipped: 0 };
    (Array.isArray(p.tasks) ? p.tasks : []).forEach(function (r) {
      if (F.validTask(r)) { if (!r.cf) r.cf = {}; out.tasks.push(r); } else out.skipped++;
    });
    (Array.isArray(p.patients) ? p.patients : []).forEach(function (r) {
      if (F.validPatient(r)) { if (!r.cf) r.cf = {}; out.patients.push(r); } else out.skipped++;
    });
    (Array.isArray(p.local) ? p.local : []).forEach(function (r) {
      if (F.validLocal(r)) out.local.push(r); else out.skipped++;
    });
    return out;
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
