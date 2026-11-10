/* Wiedervorlage – lokaler Speicher (IndexedDB)
 * Jede Änderung läuft in genau einer Transaktion: Zähler erhöhen, Datensätze lesen,
 * neu berechnen, schreiben. Erfolg wird erst nach "oncomplete" gemeldet.
 */
(function (root) {
  'use strict';
  var WV = root.WV, u = WV.util, D = WV.dates;
  var DB = WV.db = {};
  DB.NAME = 'wiedervorlage';
  DB.VERSION = 1;
  var STORES = ['tasks', 'patients', 'local', 'meta'];
  var db = null;
  var channel = null;

  function reqP(r) {
    return new Promise(function (res, rej) {
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }

  DB.open = function () {
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) { var e = new Error('IndexedDB nicht verfügbar'); e.code = 'NO_IDB'; reject(e); return; }
      var req;
      try { req = root.indexedDB.open(DB.NAME, DB.VERSION); } catch (err) { reject(err); return; }
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains('tasks')) d.createObjectStore('tasks', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('patients')) d.createObjectStore('patients', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('local')) d.createObjectStore('local', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'k' });
      };
      req.onsuccess = function () {
        db = req.result;
        db.onversionchange = function () { db.close(); if (DB.onBlocked) DB.onBlocked(); };
        ensureDevice().then(function () { resolve(db); }, reject);
      };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () { if (DB.onBlocked) DB.onBlocked(); };
    }).then(function (d) {
      try {
        if (typeof root.BroadcastChannel === 'function') {
          channel = new root.BroadcastChannel('wiedervorlage');
          channel.onmessage = function (ev) { if (DB.onRemoteChange) DB.onRemoteChange(ev.data); };
        }
      } catch (e) { channel = null; }
      return d;
    });
  };

  function ensureDevice() {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(['meta'], 'readwrite');
      var st = tx.objectStore('meta');
      var r = st.get('device');
      r.onsuccess = function () {
        if (!r.result) {
          st.put({ k: 'device', v: { id: u.shortId(), createdAt: D.isoNow() } });
          st.put({ k: 'counter', v: 0 });
          st.put({ k: 'changeSeq', v: 0 });
          st.put({ k: 'schema', v: WV.SCHEMA });
        }
      };
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error || new Error('abort')); };
    });
  }

  DB.notify = function (msg) {
    try { if (channel) channel.postMessage(msg || { type: 'changed' }); } catch (e) { /* ohne Inhalte */ }
  };

  DB.loadAll = function () {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORES, 'readonly');
      var out = {};
      var meta = {};
      reqP(tx.objectStore('tasks').getAll()).then(function (r) { out.tasks = r; });
      reqP(tx.objectStore('patients').getAll()).then(function (r) { out.patients = r; });
      reqP(tx.objectStore('local').getAll()).then(function (r) { out.local = r; });
      reqP(tx.objectStore('meta').getAll()).then(function (r) { r.forEach(function (e) { meta[e.k] = e.v; }); out.meta = meta; });
      tx.oncomplete = function () { resolve(out); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error || new Error('abort')); };
    });
  };

  DB.getMeta = function (k) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(['meta'], 'readonly');
      var r = tx.objectStore('meta').get(k);
      r.onsuccess = function () { resolve(r.result ? r.result.v : undefined); };
      tx.onerror = function () { reject(tx.error); };
    });
  };

  DB.setMeta = function (k, v) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(['meta'], 'readwrite');
      tx.objectStore('meta').put({ k: k, v: v });
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error || new Error('abort')); };
    });
  };

  // Atomare Lese-Ändere-Schreibe-Operation auf einem Meta-Eintrag
  DB.updateMeta = function (k, fn) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(['meta'], 'readwrite');
      var st = tx.objectStore('meta');
      var result;
      var r = st.get(k);
      r.onsuccess = function () {
        try {
          result = fn(r.result ? r.result.v : undefined);
          st.put({ k: k, v: result });
        } catch (e) { tx.abort(); reject(e); }
      };
      tx.oncomplete = function () { resolve(result); };
      tx.onerror = function () { reject(tx.error); };
    });
  };

  // ids: { tasks:[], patients:[], local:[] }
  // fn(cur, ctx) → { tasks:[], patients:[], local:[], meta:{}, dirty:true|false, stamp:true|false }
  //   cur: { tasks:{id:rec}, patients:{}, local:{}, meta:{…} }, ctx: { dev, c, t }
  DB.mutate = function (ids, fn) {
    return new Promise(function (resolve, reject) {
      var tx;
      try { tx = db.transaction(STORES, 'readwrite'); } catch (e) { reject(e); return; }
      var st = {};
      STORES.forEach(function (s) { st[s] = tx.objectStore(s); });
      var cur = { tasks: {}, patients: {}, local: {}, meta: {} };
      var pending = 0, result = null, failed = false;
      function get(store, key, target) {
        pending++;
        var r = st[store].get(key);
        r.onsuccess = function () {
          if (store === 'meta') target[key] = r.result ? r.result.v : undefined;
          else target[key] = r.result;
          if (--pending === 0) run();
        };
      }
      ['device', 'counter', 'changeSeq', 'backupState'].forEach(function (k) { get('meta', k, cur.meta); });
      (ids.tasks || []).forEach(function (id) { get('tasks', id, cur.tasks); });
      (ids.patients || []).forEach(function (id) { get('patients', id, cur.patients); });
      (ids.local || []).forEach(function (id) { get('local', id, cur.local); });

      function run() {
        try {
          var counter = (cur.meta.counter || 0) + 1;
          var ctx = { dev: cur.meta.device.id, c: counter, t: D.isoNow() };
          var out = fn(cur, ctx) || {};
          (out.tasks || []).forEach(function (r) { st.tasks.put(r); });
          (out.patients || []).forEach(function (r) { st.patients.put(r); });
          (out.local || []).forEach(function (r) { st.local.put(r); });
          if (out.stamp !== false) st.meta.put({ k: 'counter', v: counter });
          if (out.dirty !== false) {
            var seq = (cur.meta.changeSeq || 0) + 1;
            st.meta.put({ k: 'changeSeq', v: seq });
            var bs = cur.meta.backupState || {};
            if (!bs.firstUnbackedAt) {
              bs.firstUnbackedAt = ctx.t;
              st.meta.put({ k: 'backupState', v: bs });
            }
            out.changeSeq = seq;
          }
          if (out.meta) Object.keys(out.meta).forEach(function (k) { st.meta.put({ k: k, v: out.meta[k] }); });
          result = out;
        } catch (e) {
          failed = true;
          try { tx.abort(); } catch (e2) { /* bereits beendet */ }
          reject(e);
        }
      }
      tx.oncomplete = function () { if (!failed) { DB.notify({ type: 'changed' }); resolve(result); } };
      tx.onerror = function () { if (!failed) { failed = true; reject(tx.error); } };
      tx.onabort = function () { if (!failed) { failed = true; reject(tx.error || new Error('Speichern abgebrochen')); } };
    });
  };

  // Nach erfolgreicher Sicherung: Stand vermerken (in einer Transaktion mit dem Änderungszähler)
  DB.finishBackup = function (snapSeq, patch) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(['meta'], 'readwrite');
      var st = tx.objectStore('meta');
      var result;
      var r1 = st.get('changeSeq');
      r1.onsuccess = function () {
        var cur = r1.result ? r1.result.v : 0;
        var r2 = st.get('backupState');
        r2.onsuccess = function () {
          var bs = r2.result ? r2.result.v : {};
          Object.keys(patch || {}).forEach(function (k) { bs[k] = patch[k]; });
          bs.lastOkSeq = Math.max(bs.lastOkSeq || 0, snapSeq);
          if (cur <= bs.lastOkSeq) bs.firstUnbackedAt = null;
          st.put({ k: 'backupState', v: bs });
          result = { bs: bs, changeSeq: cur };
        };
      };
      tx.oncomplete = function () { resolve(result); };
      tx.onerror = function () { reject(tx.error); };
    });
  };

  DB.requestPersist = function () {
    try {
      if (root.navigator && root.navigator.storage && root.navigator.storage.persist) {
        return root.navigator.storage.persisted().then(function (p) {
          return p ? true : root.navigator.storage.persist();
        }).catch(function () { return null; });
      }
    } catch (e) { /* nicht verfügbar */ }
    return Promise.resolve(null);
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
