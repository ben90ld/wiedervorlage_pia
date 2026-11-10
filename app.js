/*! Wiedervorlage 0.4.0 – erzeugt aus src/ (00-base.js, 10-dates.js, 20-model.js, 30-merge.js, 40-crypto.js, 45-format.js, 50-db.js, 55-auth.js, 56-drive.js, 60-backup.js, 65-sync.js, 70-icons.js, 80-ui.js, 90-main.js) */

/* ---- 00-base.js ---- */
/* Wiedervorlage – Basis und Hilfsfunktionen */
(function (root) {
  'use strict';
  var WV = root.WV = root.WV || {};
  WV.VERSION = '0.4.0';
  WV.SCHEMA = 1;

  var u = WV.util = {};

  u.randomBytes = function (n) {
    var a = new Uint8Array(n);
    root.crypto.getRandomValues(a);
    return a;
  };

  u.hex = function (bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return s;
  };

  u.uuid = function () {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    var b = u.randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = u.hex(b);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  };

  // Kurze zufällige Kennung (Geräte-ID), 10 Zeichen aus 32 Zeichen = 50 Bit
  u.shortId = function () {
    var alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
    var b = u.randomBytes(10);
    var s = '';
    for (var i = 0; i < 10; i++) s += alphabet[b[i] & 31];
    return s;
  };

  u.clone = function (o) {
    return o === undefined ? undefined : JSON.parse(JSON.stringify(o));
  };

  u.eq = function (a, b) {
    if (a === b) return true;
    if (a == null || b == null) return a == null && b == null;
    if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
    return false;
  };

  u.debounce = function (fn, ms) {
    var t = null;
    var d = function () {
      var args = arguments, self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(self, args); }, ms);
    };
    d.flush = function () {
      if (t) { clearTimeout(t); t = null; fn(); }
    };
    d.cancel = function () { if (t) { clearTimeout(t); t = null; } };
    d.pending = function () { return t !== null; };
    return d;
  };

  // Für Suche: Kleinschreibung, Umlaute/Akzente vereinheitlicht
  u.fold = function (s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  };

  u.plural = function (n, one, many) { return n === 1 ? one : many; };
})(typeof globalThis !== 'undefined' ? globalThis : self);

/* ---- 10-dates.js ---- */
/* Wiedervorlage – Datumslogik
 * Alle Wiedervorlagen und Fristen sind reine Kalenderdaten (JJJJ-MM-TT).
 * Gerechnet wird mit ganzen Tagesnummern über Date.UTC – dadurch unabhängig
 * von Zeitumstellung, Monats- und Jahreswechseln. "Heute" ist das lokale Datum.
 */
(function (root) {
  'use strict';
  var WV = root.WV;
  var DAY = 86400000;
  var WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  var nowFn = function () { return new Date(); };

  var D = WV.dates = {};

  D.setNow = function (fn) { nowFn = fn || function () { return new Date(); }; };
  D.now = function () { return nowFn(); };
  D.isoNow = function () { return nowFn().toISOString(); };

  D.isValid = function (s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
    var dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  };

  D.toNum = function (s) {
    return Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY);
  };

  D.fromNum = function (n) {
    var d = new Date(n * DAY);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  };

  D.fromLocalDate = function (d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };

  D.today = function () { return D.fromLocalDate(nowFn()); };

  D.addDays = function (s, n) { return D.fromNum(D.toNum(s) + n); };

  D.daysInMonth = function (y, m) { // m: 1–12
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  };

  // Gleicher Tag im Zielmonat; existiert er nicht, letzter Tag des Monats (31.01. + 1 Monat = 28./29.02.)
  D.addMonths = function (s, n) {
    var y = +s.slice(0, 4), m = +s.slice(5, 7) - 1 + n, d = +s.slice(8, 10);
    y += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    d = Math.min(d, D.daysInMonth(y, m + 1));
    return y + '-' + pad(m + 1) + '-' + pad(d);
  };

  // a − b in Tagen
  D.diff = function (a, b) { return D.toNum(a) - D.toNum(b); };

  D.max = function (a, b) { return D.toNum(a) >= D.toNum(b) ? a : b; };

  D.weekday = function (s) { return new Date(D.toNum(s) * DAY).getUTCDay(); };

  // Verschieben: ausgehend vom späteren Zeitpunkt aus heute und bisheriger Wiedervorlage
  D.postpone = function (recall, today, unit) {
    var base = (recall && D.isValid(recall)) ? D.max(recall, today) : today;
    if (unit === 'd') return D.addDays(base, 1);
    if (unit === 'w') return D.addDays(base, 7);
    if (unit === 'm') return D.addMonths(base, 1);
    throw new Error('unit');
  };

  // Ende der Woche = Freitag dieser Woche; am Freitag heute; am Samstag/Sonntag der kommende Freitag
  D.endOfWeek = function (today) {
    return D.addDays(today, (5 - D.weekday(today) + 7) % 7);
  };

  // Schnellwahl in der Eingabe (ab heute); 'none' = Datum unbekannt
  D.pick = function (today, key) {
    if (key === '1d') return D.addDays(today, 1);
    if (key === 'eow') return D.endOfWeek(today);
    if (key === '1w') return D.addDays(today, 7);
    if (key === '2w') return D.addDays(today, 14);
    if (key === '3w') return D.addDays(today, 21);
    if (key === '4w') return D.addDays(today, 28);
    if (key === '1m') return D.addMonths(today, 1);
    return null;
  };

  // ---------- Anzeige ----------
  D.fmt = function (s) { // 14.11.2026
    return s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4);
  };

  D.fmtShort = function (s, today) { // "Fr 14.11." bzw. "14.11.2027"
    if (today && s.slice(0, 4) !== today.slice(0, 4)) return WD[D.weekday(s)] + ' ' + D.fmt(s);
    return WD[D.weekday(s)] + ' ' + s.slice(8, 10) + '.' + s.slice(5, 7) + '.';
  };

  D.relRecall = function (s, today) {
    if (!s) return 'Datum unbekannt';
    var d = D.diff(s, today);
    if (d < 0) return 'Seit ' + (-d) + ' ' + (d === -1 ? 'Tag' : 'Tagen');
    if (d === 0) return 'Heute';
    if (d === 1) return 'Morgen';
    return D.fmtShort(s, today);
  };

  D.relDeadline = function (s, today) {
    var d = D.diff(s, today);
    if (d < 0) return 'Frist überschritten (' + s.slice(8, 10) + '.' + s.slice(5, 7) + '.)';
    if (d === 0) return 'Frist heute';
    if (d === 1) return 'Frist morgen';
    return 'Frist ' + D.fmtShort(s, today);
  };

  D.fmtDateTime = function (iso) {
    if (!iso) return '–';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '–';
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };

  D.fileStamp = function () { // 2026-11-09_14-30
    var d = nowFn();
    return D.fromLocalDate(d) + '_' + pad(d.getHours()) + '-' + pad(d.getMinutes());
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);

/* ---- 20-model.js ---- */
/* Wiedervorlage – Datenmodell, Aufgabenarten, Einordnung, Sortierung, Zähler */
(function (root) {
  'use strict';
  var WV = root.WV;
  var D = WV.dates, u = WV.util;
  var M = WV.model = {};

  // ---------- Aufgabenarten ----------
  M.TYPES = [
    { id: 'doku', label: 'Doku' },
    { id: 'brief', label: 'Ambulanzbrief' },
    { id: 'bescheinigung', label: 'Bescheinigung' },
    { id: 'mail', label: 'Mail-Antwort' },
    { id: 'rueckruf', label: 'Rückruf' },
    { id: 'rezept', label: 'Rezept' },
    { id: 'befund', label: 'Befund/Labor' },
    { id: 'antrag', label: 'Antrag/Formular' },
    { id: 'rs', label: 'RS' },
    { id: 'piateam', label: 'PIA-Team' },
    { id: 'intervision', label: 'PIA-Intervision' },
    { id: 'vorbereitung', label: 'Vorbereitung' },
    { id: 'sonstiges', label: 'Sonstiges' }
  ];
  M.TYPE_BY_ID = {};
  M.TYPES.forEach(function (t) { M.TYPE_BY_ID[t.id] = t; });
  M.typeLabel = function (id) { return (M.TYPE_BY_ID[id] || M.TYPE_BY_ID.sonstiges).label; };

  // Stichwörter (bereits "gefaltet": klein, ohne Umlaute). Teilwort-Suche, da deutsche
  // Komposita das Kernwort meist am Ende tragen (Laborbefund, Rentenantrag).
  // "=xy" = nur als ganzes Wort (kurze Kürzel wie RS). Schwache Arten (allgemeine Verben wie
  // "vorbereiten") gelten nur, wenn keine andere Art erkannt wurde ("Rezept vorbereiten" → Rezept).
  M.KEYWORDS = [
    ['brief', ['ambulanzbrief', 'arztbrief', 'brief']],
    ['rezept', ['rezept', 'verordnung']],
    ['befund', ['blutwert', 'blutbild', 'befund', 'labor', 'ekg']],
    ['rueckruf', ['zuruckrufen', 'ruckruf', 'anrufen', 'telefon']],
    ['mail', ['e-mail', 'email', 'mail', 'antworten', 'antwort']],
    ['bescheinigung', ['bescheinigung', 'attest']],
    ['antrag', ['antrag', 'formular']],
    ['doku', ['dokumentation', 'dokumentieren', 'doku']],
    ['rs', ['=rs', 'rucksprache']],
    ['intervision', ['intervision']],
    ['piateam', ['pia-team', 'pia team', 'piateam', 'teambesprechung', 'teamsitzung', 'team']],
    ['vorbereitung', ['vorbereitung', 'vorbereiten'], true]
  ];

  function findKw(s, kw) {
    if (kw.charAt(0) !== '=') return s.indexOf(kw);
    var w = kw.slice(1);
    var re = new RegExp('(^|[^a-z0-9])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^a-z0-9])');
    var m = re.exec(s);
    return m ? m.index + m[1].length : -1;
  }

  // Früheste Fundstelle im Titel entscheidet; bei Gleichstand das längere Stichwort.
  M.detectType = function (title) {
    var s = u.fold(title);
    var best = null, weak = null;
    M.KEYWORDS.forEach(function (entry) {
      entry[1].forEach(function (kw) {
        var i = findKw(s, kw);
        if (i < 0) return;
        var len = kw.replace(/^=/, '').length;
        if (entry[2]) {
          if (!weak || i < weak.i) weak = { type: entry[0], i: i, len: len };
          return;
        }
        if (!best || i < best.i || (i === best.i && len > best.len)) best = { type: entry[0], i: i, len: len };
      });
    });
    if (best) return best.type;
    return weak ? weak.type : 'sonstiges';
  };

  // ---------- Felder ----------
  M.TASK_FIELDS = ['title', 'type', 'typeAuto', 'patientId', 'recall', 'deadline', 'important',
    'status', 'doneAt', 'deleted', 'purged', 'createdAt', 'lastPostponedAt', 'recurrence'];
  M.PATIENT_FIELDS = ['label', 'createdAt', 'deleted'];
  // Felder, deren gleichzeitige Änderung mit "erledigt/gelöscht" als Konflikt gilt
  M.EDIT_FIELDS = ['title', 'type', 'patientId', 'recall', 'deadline', 'important'];
  // Technische Felder: bei gleichzeitiger Änderung still deterministisch entscheiden (kein Konflikt)
  M.SILENT_FIELDS = ['typeAuto', 'doneAt', 'createdAt', 'lastPostponedAt', 'purged', 'recurrence'];
  M.STATUS = ['open', 'waiting', 'done'];
  M.FIELD_LABEL = {
    title: 'Titel', type: 'Art', patientId: 'Patient', recall: 'Wiedervorlage', deadline: 'Frist',
    important: 'Wichtig', status: 'Status', label: 'Patientenkürzel'
  };
  M.STATUS_LABEL = { open: 'Offen', waiting: 'Warte auf Rückmeldung', done: 'Erledigt' };

  // Leeres CRDT-Objekt
  function blank(id) { return { id: id, v: {}, m: {}, vv: {}, cf: {} }; }

  // Schreibt geänderte Felder mit Versionspunkt (Gerät, Zähler, Zeit).
  // Unveränderte Werte werden nicht neu gestempelt (vermeidet Scheinkonflikte).
  M.write = function (rec, changes, ctx) {
    var r = u.clone(rec);
    var touched = false;
    Object.keys(changes).forEach(function (k) {
      var val = changes[k] === undefined ? null : changes[k];
      if (r.m[k] && u.eq(r.v[k], val)) return;
      r.v[k] = val;
      r.m[k] = [ctx.dev, ctx.c, ctx.t];
      touched = true;
    });
    if (touched) {
      r.vv[ctx.dev] = Math.max(r.vv[ctx.dev] || 0, ctx.c);
      r.u = ctx.t;
    }
    return r;
  };

  M.newTask = function (data, ctx) {
    var r = blank(data.id || u.uuid());
    r.pp = {};
    return M.write(r, {
      title: data.title,
      type: data.type || 'sonstiges',
      typeAuto: !!data.typeAuto,
      patientId: data.patientId || null,
      recall: data.recall,
      deadline: data.deadline || null,
      important: !!data.important,
      status: 'open',
      doneAt: null,
      deleted: false,
      purged: false,
      createdAt: ctx.t,
      lastPostponedAt: null,
      recurrence: null
    }, ctx);
  };

  M.newPatient = function (label, ctx) {
    return M.write(blank(u.uuid()), { label: label, createdAt: ctx.t, deleted: false }, ctx);
  };

  // Verschiebungszähler je Gerät: [Anzahl, Zähler-Stand der letzten Änderung]
  M.postponeCount = function (rec) {
    var n = 0;
    if (rec.pp) Object.keys(rec.pp).forEach(function (d) { n += rec.pp[d][0]; });
    return n;
  };

  M.bumpPostpone = function (rec, ctx, delta) {
    var r = u.clone(rec);
    r.pp = r.pp || {};
    var cur = r.pp[ctx.dev] ? r.pp[ctx.dev][0] : 0;
    r.pp[ctx.dev] = [Math.max(0, cur + delta), ctx.c];
    r.vv[ctx.dev] = Math.max(r.vv[ctx.dev] || 0, ctx.c);
    return r;
  };

  M.openConflicts = function (rec) {
    var out = [];
    if (rec && rec.cf) Object.keys(rec.cf).forEach(function (id) {
      if (!rec.cf[id].r) out.push(Object.assign({ id: id }, rec.cf[id]));
    });
    return out;
  };

  M.hasSpecialConflict = function (rec) {
    return M.openConflicts(rec).some(function (c) { return c.k === 'done' || c.k === 'delete'; });
  };

  M.isOpen = function (rec) {
    var v = rec.v;
    return !v.purged && !v.deleted && v.status !== 'done';
  };

  // In offenen Listen sichtbar (auch erledigte/gelöschte mit offenem Konflikt – "im Zweifel sichtbar")
  M.isVisibleOpen = function (rec) {
    if (rec.v.purged) return false;
    return M.isOpen(rec) || M.hasSpecialConflict(rec);
  };

  // ---------- Einordnung ----------
  M.classify = function (rec, today) {
    var v = rec.v;
    // Wiedervorlage unbekannt → dR = null (eigener Bereich "Ohne Datum"; nahe Fristen wirken weiter)
    var dR = v.recall && D.isValid(v.recall) ? D.diff(v.recall, today) : null;
    var dD = v.deadline ? D.diff(v.deadline, today) : null;
    var conflict = M.openConflicts(rec).length > 0;
    var tier = 3;
    if (dD !== null) {
      if (dD <= 0) tier = 0;
      else if (dD <= 2) tier = 1;
      else if (dD === 3) tier = 2;
    }
    var section;
    if ((dR !== null && dR <= 0) || (dD !== null && dD <= 2) || conflict) section = 'today';
    else if (dR === null) section = 'nodate';
    else if (dR <= 7) section = 'week';
    else section = 'later';
    var overdue = (dR !== null && dR < 0) || (dD !== null && dD < 0);
    var dueToday = !overdue && (dR === 0 || dD === 0);
    var longOverdue = section === 'today' && dR !== null && dR < -7 && !v.important && tier === 3 && !conflict;
    var deadlineColor = dD === null ? null : (dD <= 0 ? 'red' : (dD <= 3 ? 'yellow' : 'neutral'));
    return {
      dR: dR, dD: dD, tier: tier, section: section, overdue: overdue, dueToday: dueToday,
      longOverdue: longOverdue, deadlineColor: deadlineColor, conflict: conflict
    };
  };

  // Stabile Sortierung: Fristdringlichkeit → wichtig → Wiedervorlage → Frist → erstellt → ID
  M.compare = function (a, b) {
    var ca = a.cls, cb = b.cls;
    if (ca.tier !== cb.tier) return ca.tier - cb.tier;
    var ia = a.task.v.important ? 0 : 1, ib = b.task.v.important ? 0 : 1;
    if (ia !== ib) return ia - ib;
    var ra = ca.dR === null ? Infinity : ca.dR, rb = cb.dR === null ? Infinity : cb.dR;
    if (ra !== rb) return ra < rb ? -1 : 1;
    var da = ca.dD === null ? Infinity : ca.dD, db = cb.dD === null ? Infinity : cb.dD;
    if (da !== db) return da < db ? -1 : 1;
    var ta = a.task.v.createdAt || '', tb = b.task.v.createdAt || '';
    if (ta !== tb) return ta < tb ? -1 : 1;
    // gleicher Zeitpunkt: Reihenfolge der Anlage (Gerät, Zähler), zuletzt ID
    var ma = a.task.m && a.task.m.createdAt, mb = b.task.m && b.task.m.createdAt;
    if (ma && mb) {
      if (ma[0] !== mb[0]) return ma[0] < mb[0] ? -1 : 1;
      if (ma[1] !== mb[1]) return ma[1] - mb[1];
    }
    return a.task.id < b.task.id ? -1 : (a.task.id > b.task.id ? 1 : 0);
  };

  // ---------- Patienten ----------
  var PARTICLES = ['von', 'van', 'de', 'der', 'den', 'zu', 'zur', 'vom', 'ten', 'ter', 'da', 'di', 'le', 'la'];

  function capName(name) {
    if (name !== name.toLowerCase()) return name; // Schreibweise des Nutzers respektieren
    return name.split(/(\s+|-)/).map(function (part, i) {
      if (/^\s+$|^-$/.test(part) || !part) return part;
      if (i > 0 && PARTICLES.indexOf(part) >= 0) return part;
      if (i === 0 && PARTICLES.indexOf(part) >= 0 && name.split(/\s+/).length > 1) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join('');
  }

  // Normalisiert eine Eingabe auf "Nachname, X." und liefert ggf. einen Hinweis
  M.normalizePatient = function (input) {
    var s = String(input || '').trim().replace(/\s+/g, ' ');
    if (!s) return { label: '', warn: null };
    var warn = null, label, m;
    if (/\d/.test(s)) warn = 'Bitte nur Nachname und Initiale eintragen – keine Nummern oder Daten.';
    if (s.indexOf(',') >= 0) {
      var idx = s.indexOf(',');
      var name = s.slice(0, idx).trim();
      var rest = s.slice(idx + 1).trim();
      var ini = '';
      if (rest) {
        ini = rest.charAt(0).toUpperCase() + '.';
        if (rest.replace(/\.$/, '').length > 1 && !warn) warn = 'Es wird nur die Initiale des Vornamens gespeichert.';
      } else if (!warn) {
        warn = 'Format: Nachname, Initiale (z. B. „Müller, M.“).';
      }
      label = capName(name) + (ini ? ', ' + ini : '');
    } else if ((m = s.match(/^(.+?)\s+(\S)\.?$/)) && /[A-Za-zÄÖÜäöüß]/.test(m[2])) {
      label = capName(m[1]) + ', ' + m[2].toUpperCase() + '.';
    } else {
      label = capName(s);
      if (!warn) warn = 'Format: Nachname, Initiale (z. B. „Müller, M.“).';
    }
    return { label: label, warn: warn };
  };

  // Anzeigenamen mit Unterscheidung bei gleichem Kürzel: "Müller, M." / "Müller, M. (2)"
  M.patientDisplayMap = function (patients) {
    var groups = {};
    patients.forEach(function (p) {
      if (p.v.deleted) return;
      var key = u.fold(p.v.label);
      (groups[key] = groups[key] || []).push(p);
    });
    var out = {};
    Object.keys(groups).forEach(function (k) {
      var g = groups[k].sort(function (a, b) {
        var ca = a.v.createdAt || '', cb = b.v.createdAt || '';
        if (ca !== cb) return ca < cb ? -1 : 1;
        var ma = a.m && a.m.createdAt, mb = b.m && b.m.createdAt;
        if (ma && mb && ma[0] === mb[0] && ma[1] !== mb[1]) return ma[1] - mb[1];
        return a.id < b.id ? -1 : 1;
      });
      g.forEach(function (p, i) { out[p.id] = g.length > 1 && i > 0 ? p.v.label + ' (' + (i + 1) + ')' : p.v.label; });
    });
    patients.forEach(function (p) { if (!out[p.id]) out[p.id] = p.v.label; });
    return out;
  };

  // Vorschläge für die Patienteneingabe
  // Rückgabe: [{kind:'existing', patient, display, open, titles}, …, {kind:'new', label, sameLabel}]
  M.patientSuggestions = function (query, patients, tasks, display) {
    var norm = M.normalizePatient(query);
    if (!norm.label) return { items: [], warn: null, defaultIndex: -1 };
    var q = u.fold(query.replace(/[,.]/g, ' ').trim()).replace(/\s+/g, ' ');
    var qLabel = u.fold(norm.label);
    var openBy = {};
    var anyBy = {};
    tasks.forEach(function (t) {
      var pid = t.v.patientId;
      if (!pid || t.v.purged) return;
      anyBy[pid] = true;
      if (M.isOpen(t)) (openBy[pid] = openBy[pid] || []).push(t.v.title);
    });
    var matches = [];
    patients.forEach(function (p) {
      if (p.v.deleted || !anyBy[p.id]) return;
      var lab = u.fold(p.v.label);
      var labLoose = lab.replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
      if (lab === qLabel || labLoose.indexOf(q) === 0 || labLoose.indexOf(' ' + q) >= 0 || (q.length >= 3 && labLoose.indexOf(q) >= 0)) {
        matches.push({
          kind: 'existing', patient: p, display: display[p.id] || p.v.label,
          exact: lab === qLabel, open: (openBy[p.id] || []).length, titles: (openBy[p.id] || []).slice(0, 3)
        });
      }
    });
    matches.sort(function (a, b) {
      if (a.exact !== b.exact) return a.exact ? -1 : 1;
      if (a.open !== b.open) return b.open - a.open;
      return a.display < b.display ? -1 : 1;
    });
    matches = matches.slice(0, 6);
    var sameLabel = matches.some(function (m) { return m.exact; });
    var items = matches.concat([{ kind: 'new', label: norm.label, sameLabel: sameLabel }]);
    // Vorauswahl nur bei exakt gleichem Kürzel auf bestehendem Patienten, sonst "neu"
    var def = sameLabel ? 0 : items.length - 1;
    return { items: items, warn: norm.warn, defaultIndex: def };
  };

  // ---------- Gesamtansicht ----------
  // state: {tasks:[], patients:[], local: Map|obj}; opts: {today, search, fType, fImportant, fStatus}
  M.buildView = function (tasks, patientsArr, localMap, opts) {
    var today = opts.today;
    var display = M.patientDisplayMap(patientsArr);
    var getLocal = function (id) { return localMap.get ? localMap.get(id) : localMap[id]; };
    var q = opts.search ? u.fold(opts.search.trim()) : '';
    var counts = { overdue: 0, dueToday: 0, open: 0, waiting: 0, done: 0, conflicts: 0 };
    var sections = { today: [], todayLong: [], week: [], later: [], nodate: [] };
    var done = [];
    var comp = { overdue: 0, today: 0, soon: 0, conflict: 0 };

    function matches(t) {
      if (opts.fType && t.v.type !== opts.fType) return false;
      if (opts.fImportant && !t.v.important) return false;
      if (q) {
        var loc = getLocal(t.id);
        var hay = u.fold(t.v.title) + '\n' + u.fold(t.v.patientId ? (display[t.v.patientId] || '') : '') + '\n' + u.fold(loc && loc.note ? loc.note : '');
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    }

    tasks.forEach(function (t) {
      if (t.v.purged) return;
      var visibleOpen = M.isVisibleOpen(t);
      if (visibleOpen) {
        var cls = M.classify(t, today);
        if (M.isOpen(t)) {
          counts.open++;
          if (t.v.status === 'waiting') counts.waiting++;
          if (cls.overdue) counts.overdue++;
          else if (cls.dueToday) counts.dueToday++;
        }
        if (cls.conflict) counts.conflicts++;
        if (opts.fStatus === 'done') return;
        if (opts.fStatus === 'waiting' && t.v.status !== 'waiting') return;
        if (opts.fStatus === 'open' && t.v.status !== 'open' && !cls.conflict) return;
        if (!matches(t)) return;
        var item = { task: t, cls: cls, patient: t.v.patientId ? display[t.v.patientId] || null : null, local: getLocal(t.id) || null };
        if (cls.section === 'today') {
          if (cls.longOverdue) sections.todayLong.push(item); else sections.today.push(item);
          if (cls.overdue) comp.overdue++;
          else if (cls.dueToday) comp.today++;
          else if (cls.dD !== null && cls.dD <= 2) comp.soon++;
          else comp.conflict++;
        } else {
          sections[cls.section].push(item);
        }
      } else if (!t.v.deleted && t.v.status === 'done') {
        counts.done++;
        if (opts.fStatus && opts.fStatus !== 'done') return;
        if (!matches(t)) return;
        done.push({ task: t, patient: t.v.patientId ? display[t.v.patientId] || null : null, local: getLocal(t.id) || null });
      }
    });
    Object.keys(sections).forEach(function (k) { sections[k].sort(M.compare); });
    done.sort(function (a, b) {
      var x = a.task.v.doneAt || '', y = b.task.v.doneAt || '';
      return x < y ? 1 : (x > y ? -1 : (a.task.id < b.task.id ? -1 : 1));
    });
    return { counts: counts, sections: sections, done: done, composition: comp, display: display };
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);

/* ---- 30-merge.js ---- */
/* Wiedervorlage – Zusammenführung (feldweise, mit Versionsvektoren)
 *
 * Jede Benutzeraktion erhält einen Punkt (Gerät, Zähler, Zeit). Jedes Feld trägt den
 * Punkt seiner letzten Änderung, jedes Objekt einen Versionsvektor vv (Gerät → höchster
 * bekannter Zähler). Für ein Feld mit lokalem Punkt a und entferntem Punkt b gilt:
 *   - b kennt a (vvR[a.gerät] ≥ a.zähler) → b ist neuer → übernehmen
 *   - a kennt b → lokal behalten
 *   - keiner kennt den anderen → gleichzeitige Änderung:
 *       gleicher Wert → kein Konflikt; sonst Konflikt, vorläufig gilt die spätere Änderung,
 *       die andere bleibt als Konflikteintrag erhalten.
 * Zusatzregel: erledigt/gelöscht auf einer Seite + gleichzeitige Bearbeitung auf der
 * anderen → Konflikt, Aufgabe bleibt bis zur Klärung sichtbar.
 * Die Zusammenführung ist kommutativ, assoziativ und idempotent.
 */
(function (root) {
  'use strict';
  var WV = root.WV, u = WV.util, M = WV.model;
  var X = WV.merge = {};

  function dotStr(d) { return d[0] + ':' + d[1]; }
  // Deterministische Reihenfolge: spätere Zeit gewinnt; dann Geräte-ID; dann Zähler
  function cmpDot(a, b) {
    if (a[2] !== b[2]) return a[2] > b[2] ? 1 : -1;
    if (a[0] !== b[0]) return a[0] > b[0] ? 1 : -1;
    return a[1] - b[1];
  }
  function knows(vv, dot) { return ((vv && vv[dot[0]]) || 0) >= dot[1]; }
  X.knows = knows;

  // Seite A hat erledigt/gelöscht (B unbekannt), Seite B hat gleichzeitig bearbeitet (A unbekannt)
  function special(A, B) {
    var sd = A.m.status, dd = A.m.deleted;
    var aDel = A.v.deleted === true && dd && !knows(B.vv, dd);
    var aDone = A.v.status === 'done' && sd && !knows(B.vv, sd);
    if (!aDel && !aDone) return null;
    var bEdited = M.EDIT_FIELDS.some(function (f) {
      var b = B.m[f];
      return b && !knows(A.vv, b) && !u.eq(B.v[f], A.v[f]);
    });
    if (!bEdited) return null;
    var kind = aDel ? 'delete' : 'done';
    var dot = aDel ? dd : sd;
    return { id: 'S:' + kind + ':' + dotStr(dot), entry: { f: aDel ? 'deleted' : 'status', k: kind, o: null, od: dot, r: false } };
  }

  // Führt zwei Fassungen desselben Objekts zusammen.
  // Rückgabe: { rec, changed (irgendein Unterschied), valueChanged (Inhalte), isNew, newConflicts }
  X.mergeRecord = function (L, R, fields, isTask) {
    if (!R) return { rec: L, changed: false, valueChanged: false, isNew: false, newConflicts: 0 };
    if (!L) {
      return { rec: u.clone(R), changed: true, valueChanged: true, isNew: true, newConflicts: M.openConflicts(R).length };
    }
    var out = u.clone(L);
    out.v = out.v || {}; out.m = out.m || {}; out.vv = out.vv || {}; out.cf = out.cf || {};
    var Rcf = R.cf || {}, Rvv = R.vv || {}, Rm = R.m || {}, Rv = R.v || {};
    var changed = false, valueChanged = false;

    var specials = [];
    if (isTask) {
      var s1 = special(L, R), s2 = special(R, L);
      if (s1) specials.push(s1);
      if (s2) specials.push(s2);
    }

    fields.forEach(function (f) {
      var a = L.m[f], b = Rm[f];
      if (!b) return;
      if (!a) {
        out.v[f] = Rv[f]; out.m[f] = b.slice(); changed = true; valueChanged = true;
        return;
      }
      if (a[0] === b[0] && a[1] === b[1]) return;
      var bKnowsA = knows(Rvv, a), aKnowsB = knows(L.vv, b);
      if (bKnowsA && !aKnowsB) {
        if (!u.eq(out.v[f], Rv[f])) valueChanged = true;
        out.v[f] = Rv[f]; out.m[f] = b.slice(); changed = true;
        return;
      }
      if (aKnowsB && !bKnowsA) return;
      var bWins = cmpDot(b, a) > 0;
      if (!(aKnowsB && bKnowsA) && !u.eq(L.v[f], Rv[f]) && M.SILENT_FIELDS.indexOf(f) < 0) {
        var cid = 'V:' + f + ':' + [dotStr(a), dotStr(b)].sort().join('|');
        if (!out.cf[cid]) {
          var loserVal = bWins ? L.v[f] : Rv[f];
          var loserDot = bWins ? a : b;
          out.cf[cid] = { f: f, k: 'value', o: u.clone(loserVal === undefined ? null : loserVal), od: loserDot.slice(), r: false };
          changed = true; valueChanged = true;
        }
      }
      if (bWins) {
        if (!u.eq(out.v[f], Rv[f])) valueChanged = true;
        out.v[f] = Rv[f]; out.m[f] = b.slice(); changed = true;
      }
    });

    specials.forEach(function (s) {
      if (!out.cf[s.id]) { out.cf[s.id] = s.entry; changed = true; valueChanged = true; }
    });

    Object.keys(Rcf).forEach(function (id) {
      var rc = Rcf[id];
      if (!out.cf[id]) { out.cf[id] = u.clone(rc); changed = true; valueChanged = true; }
      else if (rc.r && !out.cf[id].r) { out.cf[id].r = true; changed = true; valueChanged = true; }
    });

    Object.keys(Rvv).forEach(function (d) {
      if ((out.vv[d] || 0) < Rvv[d]) { out.vv[d] = Rvv[d]; changed = true; }
    });

    if (isTask && R.pp) {
      out.pp = out.pp || {};
      Object.keys(R.pp).forEach(function (d) {
        if (!out.pp[d] || R.pp[d][1] > out.pp[d][1]) {
          if (!out.pp[d] || out.pp[d][0] !== R.pp[d][0]) valueChanged = true;
          out.pp[d] = R.pp[d].slice(); changed = true;
        }
      });
    }

    if (R.u && (!out.u || R.u > out.u)) out.u = R.u;

    var newConflicts = 0;
    Object.keys(out.cf).forEach(function (id) {
      if (!out.cf[id].r && !(L.cf && L.cf[id] && !L.cf[id].r)) newConflicts++;
    });

    return { rec: out, changed: changed, valueChanged: valueChanged, isNew: false, newConflicts: newConflicts };
  };

  // Führt einen entfernten Datenbestand (Sicherung oder Gerätedatei) in den lokalen ein.
  // local: { tasks: Map, patients: Map, local: Map }   remote: { tasks: [], patients: [], local: [] }
  // includeLocalFields: gerätelokale Felder (Notiz) übernehmen (nur bei Sicherungen)
  X.mergeSets = function (local, remote, includeLocalFields) {
    var res = {
      tasks: [], patients: [], local: [],
      stats: { tasksNew: 0, tasksUpdated: 0, tasksSame: 0, conflicts: 0, patientsNew: 0, patientsUpdated: 0, notesUpdated: 0 },
      samples: { added: [], updated: [] }
    };
    (remote.patients || []).forEach(function (rp) {
      var r = X.mergeRecord(local.patients.get(rp.id), rp, M.PATIENT_FIELDS, false);
      if (r.changed) res.patients.push(r.rec);
      if (r.isNew) res.stats.patientsNew++;
      else if (r.valueChanged) res.stats.patientsUpdated++;
      res.stats.conflicts += r.newConflicts;
    });
    (remote.tasks || []).forEach(function (rt) {
      var r = X.mergeRecord(local.tasks.get(rt.id), rt, M.TASK_FIELDS, true);
      if (r.changed) res.tasks.push(r.rec);
      if (r.isNew) {
        res.stats.tasksNew++;
        if (!r.rec.v.purged && res.samples.added.length < 8) res.samples.added.push(r.rec.v.title);
      } else if (r.valueChanged) {
        res.stats.tasksUpdated++;
        if (!r.rec.v.purged && res.samples.updated.length < 8) res.samples.updated.push(r.rec.v.title);
      } else res.stats.tasksSame++;
      res.stats.conflicts += r.newConflicts;
    });
    if (includeLocalFields) {
      (remote.local || []).forEach(function (rl) {
        var ll = local.local.get(rl.id);
        if (!ll || (rl.lu && (!ll.lu || rl.lu > ll.lu))) {
          if (!ll || ll.note !== rl.note || ll.nextStep !== rl.nextStep) res.stats.notesUpdated++;
          res.local.push(u.clone(rl));
        }
      });
    }
    return res;
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);

/* ---- 40-crypto.js ---- */
/* Wiedervorlage – Verschlüsselung (Web Crypto API)
 * Passphrase → PBKDF2-HMAC-SHA-256 (600 000 Iterationen, 16 Byte Salt) → Schlüsselverschlüsselungsschlüssel.
 * Zufälliger 256-Bit-Datenschlüssel, mit AES-GCM verpackt. Daten: AES-256-GCM, je Vorgang neuer 96-Bit-IV.
 * Die Passphrase wird nie gespeichert. Lokal liegt nur der nicht exportierbare Datenschlüssel.
 */
(function (root) {
  'use strict';
  var WV = root.WV, u = WV.util;
  var C = WV.crypto = {};
  C.ITERATIONS = 600000;
  C.MIN_ITERATIONS = 100000;
  C.MAX_ITERATIONS = 5000000;
  var enc = new TextEncoder(), dec = new TextDecoder();

  function subtle() {
    if (!root.crypto || !root.crypto.subtle) {
      var e = new Error('Web Crypto nicht verfügbar'); e.code = 'NO_CRYPTO'; throw e;
    }
    return root.crypto.subtle;
  }
  C.available = function () { return !!(root.crypto && root.crypto.subtle); };

  C.b64 = function (bytes) {
    var s = '', chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(s);
  };
  C.unb64 = function (str) {
    var bin = atob(str), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  C.sha256Hex = async function (text) {
    var h = await subtle().digest('SHA-256', enc.encode(text));
    return u.hex(new Uint8Array(h));
  };

  C.deriveKek = async function (pass, salt, iterations) {
    var base = await subtle().importKey('raw', enc.encode(String(pass).normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iterations },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  };

  // Erzeugt neuen Datenschlüssel, verpackt mit der Passphrase
  C.createKey = async function (pass) {
    var salt = u.randomBytes(16), keyId = u.hex(u.randomBytes(8));
    var kek = await C.deriveKek(pass, salt, C.ITERATIONS);
    var raw = u.randomBytes(32), iv = u.randomBytes(12);
    var wrapped = new Uint8Array(await subtle().encrypt(
      { name: 'AES-GCM', iv: iv, additionalData: enc.encode('wv-key|' + keyId) }, kek, raw));
    var key = await subtle().importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    raw.fill(0);
    return {
      info: {
        keyId: keyId,
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: C.ITERATIONS, salt: C.b64(salt) },
        wrapped: { iv: C.b64(iv), data: C.b64(wrapped) }
      },
      key: key
    };
  };

  C.validKeyInfo = function (info) {
    return !!(info && typeof info.keyId === 'string' && /^[0-9a-f]{16}$/.test(info.keyId) &&
      info.kdf && info.kdf.name === 'PBKDF2' && info.kdf.hash === 'SHA-256' &&
      typeof info.kdf.iterations === 'number' && info.kdf.iterations >= C.MIN_ITERATIONS && info.kdf.iterations <= C.MAX_ITERATIONS &&
      typeof info.kdf.salt === 'string' && info.wrapped && typeof info.wrapped.iv === 'string' && typeof info.wrapped.data === 'string');
  };

  // Entsperrt den Datenschlüssel mit der Passphrase
  C.unlock = async function (info, pass) {
    if (!C.validKeyInfo(info)) { var e1 = new Error('Schlüsselinformation ungültig'); e1.code = 'FORMAT'; throw e1; }
    var kek = await C.deriveKek(pass, C.unb64(info.kdf.salt), info.kdf.iterations);
    var raw;
    try {
      raw = new Uint8Array(await subtle().decrypt(
        { name: 'AES-GCM', iv: C.unb64(info.wrapped.iv), additionalData: enc.encode('wv-key|' + info.keyId) },
        kek, C.unb64(info.wrapped.data)));
    } catch (e) {
      var err = new Error('Passphrase falsch'); err.code = 'WRONG_PASSPHRASE'; throw err;
    }
    var key = await subtle().importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    raw.fill(0);
    return key;
  };

  C.seal = async function (key, bytes, aad) {
    var iv = u.randomBytes(12);
    var ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: iv, additionalData: enc.encode(aad) }, key, bytes));
    return { iv: C.b64(iv), data: C.b64(ct) };
  };

  C.open = async function (key, ivB64, dataB64, aad) {
    try {
      return new Uint8Array(await subtle().decrypt(
        { name: 'AES-GCM', iv: C.unb64(ivB64), additionalData: enc.encode(aad) }, key, C.unb64(dataB64)));
    } catch (e) {
      var err = new Error('Entschlüsselung fehlgeschlagen (falscher Schlüssel oder Datei verändert)'); err.code = 'DECRYPT'; throw err;
    }
  };

  C.canCompress = function () {
    return typeof root.CompressionStream === 'function' && typeof root.DecompressionStream === 'function';
  };
  async function pipe(bytes, stream) {
    var s = new Blob([bytes]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  C.gzip = function (bytes) { return pipe(bytes, new root.CompressionStream('gzip')); };
  C.gunzip = function (bytes) { return pipe(bytes, new root.DecompressionStream('gzip')); };

  C.encodeText = function (s) { return enc.encode(s); };
  C.decodeText = function (b) { return dec.decode(b); };
})(typeof globalThis !== 'undefined' ? globalThis : self);

/* ---- 45-format.js ---- */
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

/* ---- 50-db.js ---- */
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

/* ---- 55-auth.js ---- */
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

/* ---- 56-drive.js ---- */
/* Wiedervorlage – Google Drive API v3, nur App-Ordner (appDataFolder)
 * Übertragen werden ausschließlich verschlüsselte Inhalte und technische Dateinamen.
 */
(function (root) {
  'use strict';
  var WV = root.WV, u = WV.util;
  var G = WV.drive = {};
  var API = 'https://www.googleapis.com';
  G.FIELDS = 'id,name,version,createdTime,modifiedTime,size';

  function fail(code, msg, status) { var e = new Error(msg); e.code = code; e.status = status || 0; return e; }

  async function call(token, method, path, body, contentType) {
    var headers = { Authorization: 'Bearer ' + token };
    if (contentType) headers['Content-Type'] = contentType;
    var res;
    try {
      res = await fetch(API + path, { method: method, headers: headers, body: body, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    } catch (e) {
      throw fail('NETWORK', 'Keine Verbindung zu Google Drive.');
    }
    if (res.status === 204) return '';
    var text = await res.text();
    if (!res.ok) {
      if (res.status === 401) throw fail('AUTH', 'Google-Anmeldung abgelaufen.', 401);
      if (res.status === 404) throw fail('NOTFOUND', 'Datei in Google Drive nicht gefunden.', 404);
      if (res.status === 403 || res.status === 429) throw fail('RATE', 'Google Drive lehnt die Anfrage vorübergehend ab.', res.status);
      if (res.status >= 500) throw fail('SERVER', 'Google Drive ist vorübergehend nicht erreichbar.', res.status);
      throw fail('HTTP', 'Google Drive meldet einen Fehler (' + res.status + ').', res.status);
    }
    return text;
  }

  G.list = async function (token) {
    var files = [], pageToken = '';
    do {
      var q = '/drive/v3/files?spaces=appDataFolder&pageSize=100&fields=nextPageToken,files(' + G.FIELDS + ')' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
      var r = JSON.parse(await call(token, 'GET', q));
      files = files.concat(r.files || []);
      pageToken = r.nextPageToken || '';
    } while (pageToken);
    return files;
  };

  G.download = function (token, id) {
    return call(token, 'GET', '/drive/v3/files/' + encodeURIComponent(id) + '?alt=media');
  };

  G.create = async function (token, name, text) {
    var boundary = 'wv' + u.hex(u.randomBytes(8));
    var meta = JSON.stringify({ name: name, parents: ['appDataFolder'] });
    var body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n--' + boundary +
      '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + text + '\r\n--' + boundary + '--';
    return JSON.parse(await call(token, 'POST', '/upload/drive/v3/files?uploadType=multipart&fields=' + G.FIELDS, body, 'multipart/related; boundary=' + boundary));
  };

  G.update = async function (token, id, text) {
    return JSON.parse(await call(token, 'PATCH', '/upload/drive/v3/files/' + encodeURIComponent(id) + '?uploadType=media&fields=' + G.FIELDS, text, 'application/json; charset=UTF-8'));
  };

  G.remove = function (token, id) {
    return call(token, 'DELETE', '/drive/v3/files/' + encodeURIComponent(id));
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);

/* ---- 60-backup.js ---- */
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

/* ---- 65-sync.js ---- */
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

/* ---- 70-icons.js ---- */
/* Wiedervorlage – flache Inline-SVG-Symbole (24×24, Linien in currentColor) */
(function (root) {
  'use strict';
  var WV = root.WV;
  var NS = 'http://www.w3.org/2000/svg';
  var I = WV.icons = {};

  var P = {
    brief: [['path', { d: 'M6 3h8l4 4v14H6z' }], ['path', { d: 'M14 3v4h4' }], ['path', { d: 'M9 12h6M9 16h6' }]],
    bescheinigung: [['circle', { cx: 12, cy: 9, r: 5 }], ['path', { d: 'M9.2 13.2 8 21l4-2 4 2-1.2-7.8' }], ['path', { d: 'm10 9 1.4 1.4L14.2 7.6' }]],
    mail: [['rect', { x: 3, y: 5, width: 18, height: 14, rx: 2 }], ['path', { d: 'm3.5 6.5 8.5 6.5 8.5-6.5' }]],
    rueckruf: [['path', { d: 'M5.5 3.5h3l1.8 4.6-2.3 1.4a10.5 10.5 0 0 0 6.5 6.5l1.4-2.3 4.6 1.8v3a2 2 0 0 1-2.1 2A16 16 0 0 1 3.5 5.6a2 2 0 0 1 2-2.1z' }]],
    rezept: [['path', { d: 'M10.6 20.4a4.9 4.9 0 0 1-7-7l6.8-6.8a4.9 4.9 0 0 1 7 7z' }], ['path', { d: 'm7 10 7 7' }]],
    befund: [['path', { d: 'M9 3h6M10 3v6.2L4.8 18.4A1.8 1.8 0 0 0 6.4 21h11.2a1.8 1.8 0 0 0 1.6-2.6L14 9.2V3' }], ['path', { d: 'M7.4 15h9.2' }]],
    antrag: [['rect', { x: 5, y: 4, width: 14, height: 17, rx: 2 }], ['path', { d: 'M9 4V2.8h6V4' }], ['path', { d: 'm8.8 13 2.2 2.2 4.2-4.4' }]],
    doku: [['path', { d: 'M4.5 19.5h4l10.2-10.2a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4.5 15.5z' }], ['path', { d: 'm13.2 6.8 4 4' }]],
    rs: [['path', { d: 'M3.5 4.5h11v8H8.5l-3 3v-3h-2z' }], ['path', { d: 'M14.5 8.5h6v8h-2v3l-3-3h-4.5v-4' }]],
    piateam: [['circle', { cx: 9, cy: 8, r: 3 }], ['circle', { cx: 17, cy: 9, r: 2.4 }], ['path', { d: 'M3.5 19.5a5.5 5.5 0 0 1 11 0' }], ['path', { d: 'M15 14.6a4.5 4.5 0 0 1 5.5 4.4' }]],
    intervision: [['circle', { cx: 6.5, cy: 7.5, r: 2.5 }], ['circle', { cx: 17.5, cy: 7.5, r: 2.5 }], ['path', { d: 'M2.5 18a4 4 0 0 1 8 0M13.5 18a4 4 0 0 1 8 0' }], ['path', { d: 'M10 5.5h4M12.6 4l1.4 1.5-1.4 1.5' }]],
    vorbereitung: [['path', { d: 'M9.5 6.5h10M9.5 12h10M9.5 17.5h10' }], ['path', { d: 'm3.8 6.5 1.2 1.2 2.2-2.4' }], ['circle', { cx: 5.3, cy: 12, r: 1.3 }], ['circle', { cx: 5.3, cy: 17.5, r: 1.3 }]],
    sonstiges: [['circle', { cx: 6, cy: 12, r: 1.6, fill: 'currentColor' }], ['circle', { cx: 12, cy: 12, r: 1.6, fill: 'currentColor' }], ['circle', { cx: 18, cy: 12, r: 1.6, fill: 'currentColor' }]],
    check: [['path', { d: 'M5 12.5 9.5 17 19 7.5' }]],
    circle: [['circle', { cx: 12, cy: 12, r: 8.5 }]],
    star: [['path', { d: 'M12 3.6 14.5 8.8l5.7.8-4.1 4 1 5.6L12 16.5l-5.1 2.7 1-5.6-4.1-4 5.7-.8z' }]],
    starFill: [['path', { d: 'M12 3.6 14.5 8.8l5.7.8-4.1 4 1 5.6L12 16.5l-5.1 2.7 1-5.6-4.1-4 5.7-.8z', fill: 'currentColor' }]],
    settings: [['path', { d: 'M4 7h9M17 7h3M4 17h3M11 17h9' }], ['circle', { cx: 15, cy: 7, r: 2 }], ['circle', { cx: 9, cy: 17, r: 2 }]],
    search: [['circle', { cx: 10.5, cy: 10.5, r: 6 }], ['path', { d: 'm15 15 5 5' }]],
    x: [['path', { d: 'M6 6l12 12M18 6 6 18' }]],
    trash: [['path', { d: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13' }]],
    download: [['path', { d: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14' }]],
    upload: [['path', { d: 'M12 16V5M7.5 9.5 12 5l4.5 4.5M5 20h14' }]],
    folder: [['path', { d: 'M3 6.5h6l2 2h10V19H3z' }]],
    alert: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 7.5v5.5M12 16.5v.01' }]],
    lock: [['rect', { x: 5, y: 11, width: 14, height: 9, rx: 2 }], ['path', { d: 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3' }]],
    restore: [['path', { d: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3' }], ['path', { d: 'M4.5 4.5v4h4' }]],
    chevron: [['path', { d: 'm9 6 6 6-6 6' }]],
    calendar: [['rect', { x: 4, y: 5, width: 16, height: 15, rx: 2 }], ['path', { d: 'M4 10h16M8.5 3v4M15.5 3v4' }]],
    flag: [['path', { d: 'M6 21V4M6 4h11l-2.5 4L17 12H6' }]],
    shield: [['path', { d: 'M12 3 5 6v5.5c0 4.4 3 7.9 7 9.5 4-1.6 7-5.1 7-9.5V6z' }], ['path', { d: 'm9 12 2 2 4-4' }]],
    conflict: [['path', { d: 'M12 3 2.8 19.5h18.4z' }], ['path', { d: 'M12 9.5v4.5M12 17v.01' }]]
  };

  I.svg = function (name, cls) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('class', 'ico' + (cls ? ' ' + cls : ''));
    (P[name] || P.sonstiges).forEach(function (spec) {
      var el = document.createElementNS(NS, spec[0]);
      Object.keys(spec[1]).forEach(function (k) { el.setAttribute(k, String(spec[1][k])); });
      svg.appendChild(el);
    });
    return svg;
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);

/* ---- 80-ui.js ---- */
/* Wiedervorlage – Oberfläche
 * Freitext wird ausschließlich über textContent / Textknoten eingefügt (kein innerHTML).
 */
(function (root) {
  'use strict';
  var WV = root.WV, D = WV.dates, M = WV.model, u = WV.util, DB = WV.db, B = WV.backup, Ctl = WV.backupCtl, I = WV.icons;
  var doc = root.document;
  var $ = function (id) { return doc.getElementById(id); };

  // ---------- DOM-Hilfen ----------
  function h(tag, attrs, children) {
    var el = doc.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    });
    add(el, children);
    return el;
  }
  function add(el, children) {
    if (children == null) return;
    if (!Array.isArray(children)) children = [children];
    children.forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? doc.createTextNode(String(c)) : c);
    });
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function icon(name, cls) { return I.svg(name, cls); }

  // ---------- Zustand ----------
  var UI_KEY = 'wv-ui', DRAFT_KEY = 'wv-draft';
  function loadUi() {
    var d = { theme: 'auto', openDone: false, openLong: false };
    try { Object.assign(d, JSON.parse(root.localStorage.getItem(UI_KEY) || '{}')); } catch (e) { /* ohne gespeicherte Einstellungen */ }
    d.search = ''; d.fType = ''; d.fImportant = false; d.fStatus = '';
    d.doneLimit = 50; d.confirmPurge = null; d.highlightId = null; d.bannerLater = false;
    return d;
  }
  function saveUi() {
    try { root.localStorage.setItem(UI_KEY, JSON.stringify({ theme: S.ui.theme, openDone: S.ui.openDone, openLong: S.ui.openLong })); } catch (e) { /* nicht kritisch */ }
  }

  var S = WV.state = {
    tasks: new Map(), patients: new Map(), local: new Map(), device: null,
    ui: loadUi(), view: null, today: null, swWaiting: null, swUpdating: false, persisted: null,
    isFile: root.location.protocol === 'file:', fatal: null, stale: false,
    isIOS: /iPhone|iPad|iPod/.test(root.navigator.userAgent) || (root.navigator.platform === 'MacIntel' && root.navigator.maxTouchPoints > 1)
  };

  WV.ui = {};

  WV.ui.loadState = async function () {
    var all = await DB.loadAll();
    S.tasks = new Map(all.tasks.map(function (t) { return [t.id, t]; }));
    S.patients = new Map(all.patients.map(function (p) { return [p.id, p]; }));
    S.local = new Map(all.local.map(function (l) { return [l.id, l]; }));
    S.device = all.meta.device || null;
  };

  // ---------- Toasts ----------
  function toast(msg, opts) {
    opts = opts || {};
    var box = $('toasts');
    var el = h('div', { class: 'toast' + (opts.level ? ' ' + opts.level : '') });
    var closed = false;
    function close() { if (closed) return; closed = true; if (el.parentNode) el.parentNode.removeChild(el); }
    add(el, [h('span', { class: 'toast-msg' }, msg)]);
    if (opts.action) {
      add(el, [h('button', { type: 'button', class: 'btn link', onclick: function () { close(); opts.onAction(); } }, opts.action)]);
    }
    add(el, [h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'Meldung schließen', onclick: close }, [icon('x')])]);
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    var t = opts.timeout === undefined ? 3500 : opts.timeout;
    if (t) setTimeout(close, t);
    return close;
  }
  WV.ui.toast = toast;

  // ---------- Speichern ----------
  var persistAsked = false;
  async function commit(ids, fn) {
    var out;
    try {
      out = await DB.mutate(ids, fn);
    } catch (e) {
      toast('Speichern fehlgeschlagen. Die Änderung wurde nicht übernommen.', { level: 'error', timeout: 0 });
      throw e;
    }
    (out.tasks || []).forEach(function (r) { S.tasks.set(r.id, r); });
    (out.patients || []).forEach(function (r) { S.patients.set(r.id, r); });
    (out.local || []).forEach(function (r) { S.local.set(r.id, r); });
    if (typeof out.changeSeq === 'number') Ctl.noteChange(out.changeSeq);
    if (WV.sync) WV.sync.noteChange();
    if (!persistAsked) { persistAsked = true; DB.requestPersist().then(function (p) { S.persisted = p; }); }
    return out;
  }

  // ---------- Aktionen ----------
  var A = WV.actions = {};

  function resolvePatient(sel, ctx, out) {
    if (!sel) return null;
    if (sel.id) return sel.id;
    if (sel.newLabel) { var p = M.newPatient(sel.newLabel, ctx); out.patients.push(p); return p.id; }
    return null;
  }

  A.create = function (data) {
    return commit({}, function (cur, ctx) {
      var out = { tasks: [], patients: [], local: [] };
      var pid = resolvePatient(data.patient, ctx, out);
      var t = M.newTask({
        title: data.title, type: data.type, typeAuto: data.typeAuto, patientId: pid,
        recall: data.recall, deadline: data.deadline, important: data.important
      }, ctx);
      out.tasks.push(t);
      if (data.note) out.local.push({ id: t.id, note: data.note, nextStep: null, lu: ctx.t });
      out.created = t;
      return out;
    });
  };

  // changes: Felder; changes.patient = {id}|{newLabel}|null; opts.countPostpone
  A.update = function (id, changes, opts) {
    opts = opts || {};
    return commit({ tasks: [id] }, function (cur, ctx) {
      var t = cur.tasks[id];
      if (!t) throw new Error('missing');
      var out = { tasks: [], patients: [], prev: t };
      var ch = Object.assign({}, changes);
      if ('patient' in ch) { ch.patientId = resolvePatient(ch.patient, ctx, out); delete ch.patient; }
      if (ch.status === 'done' && t.v.status !== 'done') ch.doneAt = ctx.t;
      if (ch.status && ch.status !== 'done') ch.doneAt = null;
      var r = M.write(t, ch, ctx);
      if (opts.countPostpone) {
        r = M.write(r, { lastPostponedAt: ctx.t }, ctx);
        r = M.bumpPostpone(r, ctx, 1);
      }
      (opts.resolve || []).forEach(function (cid) { if (r.cf && r.cf[cid]) r.cf[cid].r = true; });
      out.tasks.push(r);
      out.newPatientId = ch.patientId;
      return out;
    });
  };

  A.postpone = function (id, unit) {
    return commit({ tasks: [id] }, function (cur, ctx) {
      var t = cur.tasks[id];
      if (!t) throw new Error('missing');
      var nr = D.postpone(t.v.recall, D.today(), unit);
      var r = M.write(t, { recall: nr, lastPostponedAt: ctx.t }, ctx);
      r = M.bumpPostpone(r, ctx, 1);
      return { tasks: [r], prev: t, newRecall: nr };
    });
  };

  // Setzt alle Felder auf den vorherigen Stand zurück (als neue Änderung)
  A.revert = function (id, prev) {
    return commit({ tasks: [id] }, function (cur, ctx) {
      var t = cur.tasks[id];
      if (!t) throw new Error('missing');
      var ch = {};
      M.TASK_FIELDS.forEach(function (f) {
        if (f === 'createdAt') return;
        if (!u.eq(t.v[f], prev.v[f])) ch[f] = u.clone(prev.v[f]);
      });
      var r = M.write(t, ch, ctx);
      var own = ctx.dev;
      var curOwn = t.pp && t.pp[own] ? t.pp[own][0] : 0;
      var prevOwn = prev.pp && prev.pp[own] ? prev.pp[own][0] : 0;
      if (curOwn !== prevOwn) r = M.bumpPostpone(r, ctx, prevOwn - curOwn);
      return { tasks: [r] };
    });
  };

  A.setLocal = function (id, fields) {
    return commit({ local: [id] }, function (cur, ctx) {
      var l = Object.assign({ id: id, note: null, nextStep: null }, cur.local[id] || {}, fields, { lu: ctx.t });
      return { local: [l], stamp: false };
    });
  };

  A.purge = function (id) {
    return commit({ tasks: [id], local: [id] }, function (cur, ctx) {
      var t = cur.tasks[id];
      if (!t) throw new Error('missing');
      var r = M.write(t, { title: '', patientId: null, deadline: null, purged: true, deleted: true }, ctx);
      return { tasks: [r], local: cur.local[id] ? [{ id: id, note: null, nextStep: null, lu: ctx.t }] : [] };
    });
  };

  A.resolveConflict = function (id, cid, choice) {
    var t = S.tasks.get(id);
    var c = t && t.cf ? t.cf[cid] : null;
    if (!c) return Promise.resolve();
    var changes = {};
    if (c.k === 'value' && choice === 'other') {
      if (c.f === 'patientId') changes.patient = c.o ? { id: c.o } : null;
      else changes[c.f] = c.o;
    }
    if (c.k === 'done' && choice === 'reopen') changes.status = 'open';
    if (c.k === 'delete' && choice === 'restore') changes.deleted = false;
    return A.update(id, changes, { resolve: [cid] });
  };

  // ---------- Anzeige: Kopfzeile ----------
  function renderCounters(c) {
    var box = $('counters');
    clear(box);
    function pill(cls, label, short, n, title) {
      return h('span', { class: 'counter ' + cls + (n === 0 ? ' zero' : ''), title: title }, [h('span', { class: 'c-n' }, String(n)), ' ',
        h('span', { class: 'c-l' }, label), h('span', { class: 'c-s', 'aria-hidden': 'true' }, short)]);
    }
    add(box, [
      pill('c-over', 'Überfällig', 'überfällig', c.overdue, 'Wiedervorlage oder Frist in der Vergangenheit'),
      pill('c-today', 'Heute fällig', 'heute', c.dueToday, 'Wiedervorlage oder Frist heute'),
      pill('c-open', 'Offen gesamt', 'offen', c.open, 'Alle nicht erledigten Aufgaben')
    ]);
  }

  function renderBackupPill() {
    var st = Ctl.status();
    var pillEl = $('backupPill');
    clear(pillEl);
    pillEl.className = 'pill lvl-' + st.level;
    var ic = st.level === 'ok' ? 'shield' : (st.level === 'error' ? 'alert' : (st.code === 'reconnect' ? 'folder' : 'lock'));
    add(pillEl, [icon(ic), h('span', { class: 'pill-text' }, st.text)]);
    pillEl.title = 'Sicherung: ' + st.text + ' – Klick für Details';
  }

  function renderBanners() {
    var box = $('banners');
    clear(box);
    if (S.fatal) {
      box.appendChild(h('div', { class: 'banner error', role: 'alert' }, [icon('alert'), h('span', null, S.fatal)]));
    }
    if (S.stale) {
      box.appendChild(h('div', { class: 'banner warn' }, [icon('alert'), h('span', null, 'Die App wurde in einem anderen Fenster aktualisiert.'),
        h('button', { type: 'button', class: 'btn small', onclick: function () { root.location.reload(); } }, 'Neu laden')]));
    }
    if (S.swWaiting) {
      box.appendChild(h('div', { class: 'banner info' }, [icon('download'), h('span', null, 'Eine neue Version der Wiedervorlage ist verfügbar.'),
        h('button', { type: 'button', class: 'btn small primary', onclick: applyUpdate }, 'Jetzt aktualisieren')]));
    }
    if (S.authBanner && WV.sync && WV.sync.enabled()) {
      box.appendChild(h('div', { class: 'banner info' }, [icon('restore'), h('span', null, S.authBanner + ' Für die Synchronisation bitte kurz anmelden.'),
        h('button', { type: 'button', class: 'btn small primary', onclick: function () { S.authBanner = null; goGoogle('select_account', 'manual'); } }, 'Mit Google anmelden')]));
    }
    var st = Ctl.status();
    if (st.unbackedOld && !S.ui.bannerLater) {
      box.appendChild(h('div', { class: 'banner warn' }, [icon('lock'),
        h('span', null, 'Seit mehr als einem Tag gibt es ungesicherte Änderungen.'),
        h('button', { type: 'button', class: 'btn small primary', onclick: backupNow }, 'Jetzt sichern'),
        h('button', { type: 'button', class: 'btn small link', onclick: function () { S.ui.bannerLater = true; renderBanners(); } }, 'Später')]));
    }
  }

  // ---------- Anzeige: Liste ----------
  function filtersActive() {
    return !!(S.ui.search.trim() || S.ui.fType || S.ui.fImportant || S.ui.fStatus);
  }

  var EMPTY = {
    today: 'Nichts fällig. Keine nahen Fristen.',
    week: 'Keine Wiedervorlagen in den nächsten 7 Tagen.',
    later: 'Keine späteren Wiedervorlagen.',
    nodate: 'Keine Aufgaben ohne Wiedervorlagedatum.'
  };

  function render() {
    S.today = D.today();
    var view = M.buildView(Array.from(S.tasks.values()), Array.from(S.patients.values()), S.local, {
      today: S.today, search: S.ui.search, fType: S.ui.fType, fImportant: S.ui.fImportant, fStatus: S.ui.fStatus
    });
    S.view = view;
    renderCounters(view.counts);
    if (WV.ui.renderSyncPill) WV.ui.renderSyncPill();
    renderBackupPill();
    renderBanners();
    renderFilters();
    renderList(view);
  }
  WV.ui.render = render;

  function renderList(view) {
    var list = $('list');
    var active = doc.activeElement;
    var focusRow = active && active.closest ? active.closest('.task') : null;
    var focusId = focusRow ? focusRow.getAttribute('data-id') : null;
    var focusSec = focusRow && focusRow.closest('.sec') ? focusRow.closest('.sec').className : null;
    var focusAct = active && active.getAttribute ? active.getAttribute('data-act') : null;
    var order = focusId ? Array.prototype.map.call(list.querySelectorAll('.task'), function (e) { return e.getAttribute('data-id'); }) : [];

    var frag = doc.createDocumentFragment();
    var visibleTasks = 0;
    S.tasks.forEach(function (t) { if (!t.v.purged && !t.v.deleted) visibleTasks++; });
    if (visibleTasks === 0 && !filtersActive()) {
      frag.appendChild(welcome());
    } else {
      if (S.ui.fStatus !== 'done') {
        frag.appendChild(section('today', 'Heute & überfällig', view.sections.today, view.sections.todayLong, view.composition));
        frag.appendChild(section('week', 'Nächste 7 Tage', view.sections.week));
        frag.appendChild(section('later', 'Später', view.sections.later));
        if (view.sections.nodate.length) frag.appendChild(section('nodate', 'Wiedervorlage unbekannt', view.sections.nodate));
      }
      frag.appendChild(doneSection(view.done, view.counts.done));
    }
    clear(list);
    list.appendChild(frag);

    // Fokus erhalten (Tastaturbedienung): gleiche Zeile oder nächste in der bisherigen Reihenfolge
    if (focusId) {
      var target = list.querySelector('.task[data-id="' + cssEsc(focusId) + '"]');
      // In einen anderen Bereich gewandert (z. B. verschoben) → an alter Position weiterarbeiten
      if (target && target.closest('.sec') && target.closest('.sec').className !== focusSec) target = null;
      if (!target) {
        var idx = order.indexOf(focusId);
        for (var i = idx + 1; i < order.length && !target; i++) target = list.querySelector('.task[data-id="' + cssEsc(order[i]) + '"]');
        for (var j = idx - 1; j >= 0 && !target; j--) target = list.querySelector('.task[data-id="' + cssEsc(order[j]) + '"]');
      }
      if (target) {
        var sub = focusAct && target.getAttribute('data-id') === focusId ? target.querySelector('[data-act="' + focusAct + '"]') : null;
        (sub || target).focus({ preventScroll: true });
      } else if (focusId) {
        list.focus({ preventScroll: true });
      }
    }
  }

  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  function section(key, title, items, longItems, comp) {
    var count = items.length + (longItems ? longItems.length : 0);
    var sec = h('section', { class: 'sec sec-' + key, 'aria-labelledby': 'h-' + key });
    var head = h('div', { class: 'sec-head' }, [h('h2', { id: 'h-' + key }, [title, ' ', h('span', { class: 'count' }, String(count))])]);
    if (comp && count) {
      var parts = [];
      if (comp.overdue) parts.push(comp.overdue + ' überfällig');
      if (comp.today) parts.push(comp.today + ' heute fällig');
      if (comp.soon) parts.push(comp.soon + ' Frist in 1–2 Tagen');
      if (comp.conflict) parts.push(comp.conflict + ' Konflikt');
      head.appendChild(h('span', { class: 'sec-comp' }, parts.join(' · ')));
    }
    sec.appendChild(head);
    if (!count) {
      sec.appendChild(h('p', { class: 'empty' }, filtersActive() ? 'Keine Treffer.' : EMPTY[key]));
      return sec;
    }
    if (items.length) {
      var rows = h('div', { class: 'rows', role: 'list' });
      items.forEach(function (it) { rows.appendChild(row(it)); });
      sec.appendChild(rows);
    }
    if (longItems && longItems.length) {
      var det = h('details', { class: 'sub', open: (S.ui.openLong || filtersActive()) ? true : null });
      det.addEventListener('toggle', function () { if (!filtersActive()) { S.ui.openLong = det.open; saveUi(); } });
      det.appendChild(h('summary', null, [icon('chevron', 'chev'), 'Länger als 7 Tage überfällig, ohne nahe Frist ', h('span', { class: 'count' }, String(longItems.length))]));
      var rows2 = h('div', { class: 'rows', role: 'list' });
      longItems.forEach(function (it) { rows2.appendChild(row(it)); });
      det.appendChild(rows2);
      sec.appendChild(det);
    }
    return sec;
  }

  function typeIcon(type) {
    var t = M.TYPE_BY_ID[type] ? type : 'sonstiges';
    return h('span', { class: 'type-ico t-' + t, title: M.typeLabel(t) }, [icon(t), h('span', { class: 'sr-only' }, M.typeLabel(t))]);
  }

  function row(it) {
    var t = it.task, v = t.v, cls = it.cls;
    var today = S.today;
    var classes = 'task';
    if (v.important) classes += ' is-important';
    if (S.ui.highlightId === t.id) classes += ' is-new';
    if (cls.conflict) classes += ' has-conflict';
    if (cls.deadlineColor === 'red') classes += ' dl-urgent';
    var label = v.title + (it.patient ? ', ' + it.patient : '') + ', ' + D.relRecall(v.recall, today) + (v.deadline ? ', ' + D.relDeadline(v.deadline, today) : '');
    var el = h('div', { class: classes, role: 'listitem', tabindex: '0', 'data-id': t.id, 'aria-label': label });

    var doneBtn = h('button', { type: 'button', class: 'done-btn', 'data-act': 'done', 'aria-label': 'Als erledigt markieren', title: 'Erledigt (E)' }, [icon('check')]);
    var main = h('div', { class: 'task-main' });
    var line = h('div', { class: 'task-line' });
    if (it.patient) line.appendChild(h('span', { class: 'pat', title: 'Patient' }, it.patient));
    line.appendChild(h('span', { class: 'title' }, v.title));
    if (v.important) line.appendChild(h('span', { class: 'imp', title: 'Wichtig' }, [icon('starFill'), h('span', { class: 'sr-only' }, 'Wichtig')]));
    main.appendChild(line);

    if (cls.conflict) line.appendChild(h('span', { class: 'badge b-conflict' }, [icon('conflict'), 'Konflikt prüfen']));
    if (v.deleted) line.appendChild(h('span', { class: 'badge' }, 'gelöscht'));
    else if (v.status === 'done') line.appendChild(h('span', { class: 'badge' }, 'erledigt'));
    if (it.local && it.local.note) line.appendChild(h('span', { class: 'badge b-note', title: it.local.note }, 'Notiz'));

    var meta = h('div', { class: 'task-meta' });
    var rc = 'recall' + (cls.dR === null ? ' nodate' : (cls.dR < 0 ? ' overdue' : (cls.dR === 0 ? ' due' : '')));
    meta.appendChild(h('span', { class: rc, title: v.recall ? 'Wiedervorlage ' + D.fmt(v.recall) : 'Wiedervorlage: Datum unbekannt' }, [icon('calendar'), D.relRecall(v.recall, today)]));
    if (v.deadline) {
      meta.appendChild(h('span', { class: 'dl-slot' }, [h('span', { class: 'dl dl-' + cls.deadlineColor, title: 'Frist ' + D.fmt(v.deadline) }, [icon('flag'), D.relDeadline(v.deadline, today)])]));
    } else {
      meta.appendChild(h('span', { class: 'dl-slot', 'aria-hidden': 'true' }));
    }

    function actBtn(act, full, shortL, title, aria) {
      return h('button', { type: 'button', class: 'act', 'data-act': act, title: title, 'aria-label': aria },
        [h('span', { class: 'a-full' }, full), h('span', { class: 'a-short', 'aria-hidden': 'true' }, shortL)]);
    }
    var acts = h('div', { class: 'acts' }, [
      actBtn('pp-d', '+1 Tag', '+1 T', 'Um 1 Tag verschieben (T)', 'Um 1 Tag verschieben'),
      actBtn('pp-w', '+1 Woche', '+1 W', 'Um 1 Woche verschieben (W)', 'Um 1 Woche verschieben'),
      actBtn('pp-m', '+1 Monat', '+1 M', 'Um 1 Monat verschieben (M)', 'Um 1 Monat verschieben')
    ]);
    add(el, [doneBtn, typeIcon(v.type), main, meta, acts]);
    return el;
  }

  function doneSection(items, total) {
    var forceOpen = S.ui.fStatus === 'done' || (S.ui.search.trim() && items.length > 0);
    var det = h('details', { class: 'sec sec-done', open: (S.ui.openDone || forceOpen) ? true : null });
    det.addEventListener('toggle', function () { if (!forceOpen) { S.ui.openDone = det.open; saveUi(); } });
    var countText = filtersActive() ? items.length + ' von ' + total : String(total);
    det.appendChild(h('summary', { class: 'sec-head' }, [h('h2', null, [icon('chevron', 'chev'), 'Erledigt ', h('span', { class: 'count' }, countText)])]));
    if (!items.length) {
      det.appendChild(h('p', { class: 'empty' }, total ? 'Keine Treffer.' : 'Noch keine erledigten Aufgaben.'));
      return det;
    }
    var rows = h('div', { class: 'rows', role: 'list' });
    items.slice(0, S.ui.doneLimit).forEach(function (it) {
      var t = it.task, v = t.v;
      var el = h('div', { class: 'task is-done', role: 'listitem', tabindex: '0', 'data-id': t.id, 'data-done': '1', 'aria-label': v.title + ', erledigt' });
      var main = h('div', { class: 'task-main' }, [h('div', { class: 'task-line' }, [
        it.patient ? h('span', { class: 'pat' }, it.patient) : null,
        h('span', { class: 'title' }, v.title)
      ])]);
      var meta = h('div', { class: 'task-meta' }, [h('span', { class: 'recall' }, 'erledigt ' + (v.doneAt ? D.fmtDateTime(v.doneAt).slice(0, 10) : ''))]);
      var acts;
      if (S.ui.confirmPurge === t.id) {
        acts = h('div', { class: 'acts' }, [
          h('span', { class: 'confirm-text' }, 'Endgültig löschen?'),
          h('button', { type: 'button', class: 'act danger', 'data-act': 'purge-yes' }, 'Ja, löschen'),
          h('button', { type: 'button', class: 'act', 'data-act': 'purge-no' }, 'Abbrechen')
        ]);
      } else {
        acts = h('div', { class: 'acts' }, [
          h('button', { type: 'button', class: 'act', 'data-act': 'restore', title: 'Wieder öffnen' }, [icon('restore'), 'Wiederherstellen']),
          h('button', { type: 'button', class: 'act subtle', 'data-act': 'purge', title: 'Endgültig löschen' }, [icon('trash'), h('span', { class: 'sr-only' }, 'Endgültig löschen')])
        ]);
      }
      add(el, [h('span', { class: 'done-mark', 'aria-hidden': 'true' }, [icon('check')]), typeIcon(v.type), main, meta, acts]);
      rows.appendChild(el);
    });
    det.appendChild(rows);
    if (items.length > S.ui.doneLimit) {
      det.appendChild(h('button', { type: 'button', class: 'btn link more', onclick: function () { S.ui.doneLimit += 50; render(); } },
        'Weitere anzeigen (' + (items.length - S.ui.doneLimit) + ')'));
    }
    return det;
  }

  function welcome() {
    var box = h('section', { class: 'card welcome' }, [
      h('h2', null, 'Willkommen'),
      h('p', null, 'Auf diesem Gerät sind noch keine Aufgaben gespeichert. Neue Aufgabe einfach oben eingeben und Enter drücken.'),
      h('p', { class: 'muted' }, 'Hast du die Wiedervorlage schon genutzt (z. B. vor dem Zurücksetzen des Browsers)? Dann bitte zuerst wiederherstellen statt neu anzufangen.')
    ]);
    var btns = h('div', { class: 'btn-row' }, [
      h('button', { type: 'button', class: 'btn', onclick: function () { openImport(); } }, [icon('upload'), 'Sicherungsdatei laden'])
    ]);
    if (B.supportsFolder()) {
      btns.appendChild(h('button', { type: 'button', class: 'btn', onclick: function () { openImport({ fromFolder: true }); } }, [icon('folder'), 'Aus Sicherungsordner wiederherstellen']));
    }
    box.appendChild(btns);
    return box;
  }

  // ---------- Listen-Ereignisse ----------
  function onListClick(e) {
    var actEl = e.target.closest('[data-act]');
    var rowEl = e.target.closest('.task');
    if (!rowEl) return;
    var id = rowEl.getAttribute('data-id');
    if (actEl) {
      e.stopPropagation();
      doAct(id, actEl.getAttribute('data-act'));
      return;
    }
    if (rowEl.getAttribute('data-done')) return;
    openEdit(id);
  }

  async function doAct(id, act) {
    var t = S.tasks.get(id);
    if (!t) return;
    try {
      if (act === 'done') {
        var outD = await A.update(id, { status: 'done' });
        render();
        toast('Erledigt: ' + short(t.v.title), { action: 'Rückgängig', timeout: 8000, onAction: function () { A.revert(id, outD.prev).then(render); } });
      } else if (act === 'pp-d' || act === 'pp-w' || act === 'pp-m') {
        var outP = await A.postpone(id, act.slice(3));
        render();
        toast('Verschoben auf ' + D.fmtShort(outP.newRecall, S.today) + (t.v.deadline ? ' · Frist unverändert' : ''),
          { action: 'Rückgängig', timeout: 6000, onAction: function () { A.revert(id, outP.prev).then(render); } });
      } else if (act === 'restore') {
        await A.update(id, { status: 'open' });
        render();
        toast('Wiederhergestellt: ' + short(t.v.title));
      } else if (act === 'purge') {
        S.ui.confirmPurge = id; render();
        var b = $('list').querySelector('.task[data-id="' + cssEsc(id) + '"] [data-act="purge-no"]');
        if (b) b.focus();
      } else if (act === 'purge-no') {
        S.ui.confirmPurge = null; render();
      } else if (act === 'purge-yes') {
        S.ui.confirmPurge = null;
        await A.purge(id);
        render();
        toast('Endgültig gelöscht.');
      }
    } catch (e) { /* Meldung bereits angezeigt */ }
  }

  async function removeTask(id) {
    var t = S.tasks.get(id);
    if (!t) return;
    try {
      var out = await A.update(id, { deleted: true });
      render();
      toast('Gelöscht: ' + short(t.v.title), { action: 'Rückgängig', timeout: 8000, onAction: function () { A.revert(id, out.prev).then(render); } });
    } catch (e) { /* Meldung bereits angezeigt */ }
  }

  function short(s) { s = String(s || ''); return s.length > 48 ? s.slice(0, 47) + '…' : s; }

  // ---------- Patientenauswahl ----------
  function PatientPicker(input, list, hintEl, opts) {
    opts = opts || {};
    var self = { selected: null, items: [], index: -1, isOpen: false };

    function setHint(text, warn) {
      if (!hintEl) return;
      hintEl.textContent = text || '';
      hintEl.className = 'hint-line' + (warn ? ' warn' : '');
    }
    function close() {
      self.isOpen = false; list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
    }
    function paint() {
      clear(list);
      self.items.forEach(function (it, i) {
        var li = h('li', { role: 'option', id: list.id + '-' + i, class: 'opt-item' + (i === self.index ? ' active' : '') + (it.kind === 'new' ? ' is-new' : ''), 'aria-selected': i === self.index ? 'true' : 'false' });
        if (it.kind === 'existing') {
          add(li, [h('span', { class: 's-name' }, it.display),
            h('span', { class: 's-info' }, it.open ? it.open + ' offen: ' + it.titles.join(' · ') + (it.open > it.titles.length ? ' …' : '') : 'keine offenen Aufgaben')]);
        } else {
          add(li, [h('span', { class: 's-name' }, (it.sameLabel ? 'Anderer Patient mit gleichem Kürzel: ' : 'Neu anlegen: ') + it.label)]);
        }
        li.addEventListener('mousedown', function (e) { e.preventDefault(); choose(i); });
        list.appendChild(li);
      });
      list.hidden = self.items.length === 0;
      self.isOpen = self.items.length > 0;
      input.setAttribute('aria-expanded', self.isOpen ? 'true' : 'false');
      if (self.index >= 0) input.setAttribute('aria-activedescendant', list.id + '-' + self.index);
    }
    function compute() {
      var q = input.value;
      if (!q.trim()) { self.items = []; self.index = -1; close(); setHint(''); return; }
      var res = M.patientSuggestions(q, Array.from(S.patients.values()), Array.from(S.tasks.values()),
        S.view ? S.view.display : M.patientDisplayMap(Array.from(S.patients.values())));
      self.items = res.items; self.index = res.defaultIndex;
      paint();
      setHint(res.warn || '', !!res.warn);
    }
    function chosenHint() {
      if (!self.selected) return;
      if (self.selected.id) {
        var n = 0;
        S.tasks.forEach(function (t) { if (t.v.patientId === self.selected.id && M.isOpen(t) && t.id !== opts.excludeTaskId) n++; });
        setHint('Bestehender Patient' + (n ? ' · ' + n + ' weitere offene ' + u.plural(n, 'Aufgabe', 'Aufgaben') : ''));
      } else if (self.selected.newLabel) {
        setHint('Wird als neuer Patient angelegt.');
      }
    }
    function choose(i) {
      var it = self.items[i];
      if (!it) return;
      if (it.kind === 'existing') { self.selected = { id: it.patient.id }; input.value = it.display; }
      else { self.selected = { newLabel: it.label }; input.value = it.label; }
      close();
      chosenHint();
      if (opts.onChange) opts.onChange(self.selected);
    }
    input.addEventListener('input', function () { self.selected = null; compute(); if (opts.onInput) opts.onInput(); });
    input.addEventListener('focus', function () { if (input.value.trim() && !self.selected) compute(); });
    input.addEventListener('keydown', function (e) {
      if (self.isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        var n = self.items.length;
        self.index = (self.index + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
        paint();
      } else if (e.key === 'Enter') {
        if (self.isOpen && self.index >= 0) choose(self.index);
        if (opts.onEnter) { e.preventDefault(); opts.onEnter(); }
      } else if (e.key === 'Escape' && self.isOpen) {
        e.preventDefault(); e.stopPropagation(); close();
      } else if (e.key === 'Tab' && self.isOpen && input.value.trim() && !self.selected) {
        choose(self.index);
      }
    });
    input.addEventListener('blur', function () {
      setTimeout(function () {
        if (doc.activeElement === input) return;
        if (input.value.trim() && !self.selected && self.items.length) choose(self.index);
        else close();
      }, 150);
    });
    // Liefert die Auswahl; bei offenem Text ohne Auswahl wird der vorausgewählte Eintrag genommen
    self.resolve = function () {
      if (!input.value.trim()) return null;
      if (self.selected) return self.selected;
      compute();
      if (self.index >= 0) choose(self.index);
      return self.selected;
    };
    self.reset = function () { input.value = ''; self.selected = null; self.items = []; close(); setHint(''); };
    self.set = function (pid) {
      self.reset();
      if (!pid) return;
      var p = S.patients.get(pid);
      input.value = (S.view && S.view.display[pid]) || (p ? p.v.label : '');
      self.selected = { id: pid };
    };
    self.isListOpen = function () { return self.isOpen; };
    self.close = close;
    return self;
  }

  // ---------- Schnelleingabe ----------
  var Q = { type: null, recallPick: '1w', important: false, picker: null, saving: false };
  var RECALL_PICKS = [['1d', 'Morgen'], ['eow', 'Ende der Woche'], ['1w', '1 Woche'], ['2w', '2 Wochen'], ['3w', '3 Wochen'], ['4w', '4 Wochen'], ['none', 'unbekannt']];
  var RECALL_KEYS = RECALL_PICKS.map(function (p) { return p[0]; });

  function buildTypeChips(box, onPick) {
    clear(box);
    M.TYPES.forEach(function (t, i) {
      var b = h('button', { type: 'button', class: 'chip t-' + t.id, role: 'radio', 'aria-checked': 'false', 'data-type': t.id, tabindex: i === 0 ? '0' : '-1' }, [icon(t.id), h('span', null, t.label)]);
      b.addEventListener('click', function () { onPick(t.id); });
      box.appendChild(b);
    });
    // Pfeiltasten innerhalb der Gruppe (ein Tab-Stopp)
    box.addEventListener('keydown', function (e) {
      var keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!(e.key in keys)) return;
      var chips = Array.prototype.slice.call(box.querySelectorAll('.chip'));
      var i = chips.indexOf(doc.activeElement);
      if (i < 0) return;
      e.preventDefault();
      var n = (i + keys[e.key] + chips.length) % chips.length;
      chips.forEach(function (c, k) { c.tabIndex = k === n ? 0 : -1; });
      chips[n].focus();
    });
  }

  function paintTypeChips(box, selected, auto) {
    Array.prototype.forEach.call(box.querySelectorAll('.chip'), function (c) {
      var id = c.getAttribute('data-type');
      var on = id === selected;
      c.setAttribute('aria-checked', on ? 'true' : 'false');
      c.classList.toggle('on', on && !auto);
      c.classList.toggle('auto', on && !!auto);
      c.title = on && auto ? 'Automatisch erkannt – zum Festlegen anklicken' : M.typeLabel(id);
    });
    var any = box.querySelector('.chip[aria-checked="true"]') || box.querySelector('.chip');
    Array.prototype.forEach.call(box.querySelectorAll('.chip'), function (c) { c.tabIndex = c === any ? 0 : -1; });
  }

  function buildSeg(box, options, onPick, cls) {
    clear(box);
    options.forEach(function (o) {
      var b = h('button', { type: 'button', class: 'seg-btn' + (cls ? ' ' + cls : ''), role: 'radio', 'aria-checked': 'false', 'data-val': o[0] }, o[1]);
      b.addEventListener('click', function () { onPick(o[0]); });
      box.appendChild(b);
    });
  }
  function paintSeg(box, val) {
    Array.prototype.forEach.call(box.querySelectorAll('.seg-btn'), function (b) {
      var on = b.getAttribute('data-val') === val;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.classList.toggle('on', on);
    });
  }

  function paintToggle(btn, on, label) {
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.classList.toggle('on', on);
    clear(btn);
    add(btn, [icon(on ? 'starFill' : 'star'), h('span', null, label)]);
  }

  // Liefert Datum oder null (unbekannt)
  function quickRecall() {
    var d = $('qRecallDate').value;
    if (Q.recallPick === 'none') return null;
    if (Q.recallPick === 'date' && D.isValid(d)) return d;
    return D.pick(D.today(), Q.recallPick === 'date' ? '1w' : Q.recallPick);
  }

  function paintQuick() {
    var title = $('qTitle').value;
    var auto = !Q.type;
    var type = Q.type || (title.trim() ? M.detectType(title) : null);
    paintTypeChips($('qTypes'), type, auto);
    paintSeg($('qRecallPicks'), Q.recallPick);
    if (Q.recallPick === 'none') $('qRecallDate').value = '';
    else if (Q.recallPick !== 'date') $('qRecallDate').value = D.pick(D.today(), Q.recallPick);
    paintToggle($('qImportant'), Q.important, 'Wichtig');
  }

  function saveDraft() {
    try {
      root.localStorage.setItem(DRAFT_KEY, JSON.stringify({
        title: $('qTitle').value, patient: $('qPatient').value, type: Q.type, recallPick: Q.recallPick,
        recallDate: $('qRecallDate').value, deadline: $('qDeadline').value, important: Q.important
      }));
    } catch (e) { /* Entwurf nicht speicherbar */ }
  }
  function clearDraft() { try { root.localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignorieren */ } }
  function restoreDraft() {
    var d = null;
    try { d = JSON.parse(root.localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { d = null; }
    if (!d) return;
    $('qTitle').value = d.title || '';
    $('qPatient').value = d.patient || '';
    Q.type = M.TYPE_BY_ID[d.type] ? d.type : null;
    Q.recallPick = (RECALL_KEYS.indexOf(d.recallPick) >= 0 || d.recallPick === 'date') ? d.recallPick : '1w';
    if (Q.recallPick === 'date' && D.isValid(d.recallDate)) $('qRecallDate').value = d.recallDate;
    $('qDeadline').value = D.isValid(d.deadline) ? d.deadline : '';
    Q.important = !!d.important;
  }

  function resetQuick() {
    $('qTitle').value = '';
    Q.picker.reset();
    Q.type = null; Q.recallPick = '1w'; Q.important = false;
    $('qDeadline').value = '';
    paintQuick();
    clearDraft();
  }

  function saneDate(s) { return D.isValid(s) && +s.slice(0, 4) >= 2000 && +s.slice(0, 4) <= 2100; }

  async function saveQuick() {
    var titleEl = $('qTitle');
    var title = titleEl.value.trim();
    if (!title) {
      titleEl.focus();
      toast('Bitte zuerst einen Titel eingeben.', { timeout: 2500 });
      return;
    }
    if (Q.saving) return;
    var deadlineVal = $('qDeadline').value;
    if (deadlineVal && !saneDate(deadlineVal)) { toast('Bitte ein gültiges Fristdatum eingeben.', { level: 'warn' }); $('qDeadline').focus(); return; }
    var recall = quickRecall();
    if (recall !== null && !saneDate(recall)) { toast('Bitte ein gültiges Wiedervorlagedatum eingeben.', { level: 'warn' }); $('qRecallDate').focus(); return; }
    Q.saving = true;
    var patient = Q.picker.resolve();
    var type = Q.type || M.detectType(title);
    try {
      var out = await A.create({
        title: title, type: type, typeAuto: !Q.type, patient: patient, recall: recall,
        deadline: deadlineVal || null, important: Q.important
      });
      var id = out.created.id;
      S.ui.highlightId = id;
      resetQuick();
      render();
      titleEl.focus();
      if (WV.ui.quickActive) WV.ui.quickActive();
      toast('Gespeichert · Wiedervorlage ' + (recall ? D.fmtShort(recall, S.today) : 'unbekannt') + ' · ' + M.typeLabel(type), { timeout: 2500 });
      setTimeout(function () {
        if (S.ui.highlightId === id) {
          S.ui.highlightId = null;
          var r = $('list').querySelector('.task.is-new');
          if (r) r.classList.remove('is-new');
        }
      }, 3000);
    } catch (e) {
      /* Eingabe bleibt erhalten, Meldung bereits angezeigt */
    } finally {
      Q.saving = false;
    }
  }

  function initQuick() {
    buildTypeChips($('qTypes'), function (id) {
      Q.type = (Q.type === id) ? null : id;
      paintQuick(); saveDraft();
    });
    buildSeg($('qRecallPicks'), RECALL_PICKS, function (k) { Q.recallPick = k; paintQuick(); saveDraft(); });
    Q.picker = PatientPicker($('qPatient'), $('qPatientList'), $('qPatientHint'), { onEnter: saveQuick, onInput: saveDraft });
    $('qDeadlineClear').appendChild(icon('x'));
    restoreDraft();
    paintQuick();

    var quickBox = doc.querySelector('.quick');
    function quickActive() {
      var inside = quickBox.contains(doc.activeElement);
      var hasContent = $('qTitle').value.trim() || $('qPatient').value.trim() || $('qDeadline').value || Q.important || Q.type || Q.recallPick !== '1w';
      quickBox.classList.toggle('active', !!(inside || hasContent));
    }
    quickBox.addEventListener('focusin', quickActive);
    quickBox.addEventListener('focusout', function () { setTimeout(quickActive, 200); });
    WV.ui.quickActive = quickActive;
    quickActive();
    $('qTitle').addEventListener('input', function () { paintQuick(); saveDraft(); });
    $('qTitle').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); saveQuick(); } });
    $('qSave').addEventListener('click', saveQuick);
    $('qRecallDate').addEventListener('change', function () {
      if (D.isValid($('qRecallDate').value)) { Q.recallPick = 'date'; paintSeg($('qRecallPicks'), 'date'); saveDraft(); }
      else if (!$('qRecallDate').value) { Q.recallPick = 'none'; paintSeg($('qRecallPicks'), 'none'); saveDraft(); }
    });
    $('qDeadline').addEventListener('change', saveDraft);
    $('qDeadlineClear').addEventListener('click', function () { $('qDeadline').value = ''; saveDraft(); $('qDeadline').focus(); });
    $('qImportant').addEventListener('click', function () { Q.important = !Q.important; paintQuick(); saveDraft(); });
    // Enter in Datumsfeldern speichert ebenfalls
    ['qRecallDate', 'qDeadline'].forEach(function (id) {
      $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); saveQuick(); } });
    });
  }

  // ---------- Suche & Filter ----------
  var STATUS_FILTERS = [['', 'Alle'], ['open', 'Offen'], ['done', 'Erledigt']];
  function initFilters() {
    var sel = $('fType');
    sel.appendChild(h('option', { value: '' }, 'Alle Arten'));
    M.TYPES.forEach(function (t) { sel.appendChild(h('option', { value: t.id }, t.label)); });
    sel.addEventListener('change', function () { S.ui.fType = sel.value; render(); });
    $('fImportant').addEventListener('click', function () { S.ui.fImportant = !S.ui.fImportant; render(); });
    buildSeg($('fStatus'), STATUS_FILTERS, function (v) { S.ui.fStatus = v; render(); }, 'small');
    var doSearch = u.debounce(function () { render(); }, 120);
    $('search').addEventListener('input', function () { S.ui.search = $('search').value; doSearch(); });
    $('search').addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); $('search').value = ''; S.ui.search = ''; render(); }
    });
    $('fReset').addEventListener('click', resetFilters);
    $('fToggle').addEventListener('click', function () {
      var tb = doc.querySelector('.toolbar');
      var on = !tb.classList.contains('show-filters');
      tb.classList.toggle('show-filters', on);
      $('fToggle').setAttribute('aria-expanded', on ? 'true' : 'false');
    });
  }
  function resetFilters() {
    S.ui.search = ''; S.ui.fType = ''; S.ui.fImportant = false; S.ui.fStatus = '';
    $('search').value = '';
    render();
  }
  function renderFilters() {
    $('fType').value = S.ui.fType;
    paintToggle($('fImportant'), S.ui.fImportant, 'Wichtig');
    paintSeg($('fStatus'), S.ui.fStatus);
    $('fReset').hidden = !filtersActive();
    var nf = (S.ui.fType ? 1 : 0) + (S.ui.fImportant ? 1 : 0) + (S.ui.fStatus ? 1 : 0);
    doc.querySelector('.toolbar').classList.toggle('has-filters', nf > 0);
    $('fToggle').textContent = nf ? 'Filter (' + nf + ')' : 'Filter';
  }

  // ---------- Bearbeiten ----------
  // dirty: Felder, die in diesem Fenster geändert wurden – nur diese werden gespeichert. So überschreibt
  // ein offenes Bearbeitungsfenster keine zwischenzeitlich synchronisierten Änderungen anderer Felder.
  var E = { id: null, origRecall: null, postponeCounted: false, type: null, typeAuto: false, important: false, status: 'open', picker: null, saveTimer: null, saving: Promise.resolve(), dirty: {} };
  function markDirty(f) { E.dirty[f] = true; }
  var STATUS_OPTS = [['open', 'Offen'], ['done', 'Erledigt']];

  function setSaveState(text, cls) {
    var el = $('eSaveState');
    el.textContent = text || '';
    el.className = 'save-state' + (cls ? ' ' + cls : '');
  }

  function fmtValue(field, val) {
    if ((val == null || val === '') && field === 'recall') return 'unbekannt';
    if (val == null || val === '') return '(leer)';
    if (field === 'patientId') return (S.view && S.view.display[val]) || '(unbekannt)';
    if (field === 'type') return M.typeLabel(val);
    if (field === 'important') return val ? 'Ja' : 'Nein';
    if (field === 'recall' || field === 'deadline') return D.isValid(val) ? D.fmt(val) : String(val);
    if (field === 'status') return M.STATUS_LABEL[val] || String(val);
    return String(val);
  }

  function renderEditConflicts(t) {
    var box = $('eConflicts');
    clear(box);
    M.openConflicts(t).forEach(function (c) {
      var text, btns;
      if (c.k === 'done') {
        text = 'Diese Aufgabe wurde auf einem anderen Gerät erledigt, während sie hier gleichzeitig geändert wurde.';
        btns = [['keep', 'Erledigt lassen'], ['reopen', 'Wieder öffnen']];
      } else if (c.k === 'delete') {
        text = 'Diese Aufgabe wurde auf einem anderen Gerät gelöscht, während sie hier gleichzeitig geändert wurde.';
        btns = [['keep', 'Gelöscht lassen'], ['restore', 'Wiederherstellen']];
      } else {
        text = (M.FIELD_LABEL[c.f] || c.f) + ': abweichende gleichzeitige Änderung „' + fmtValue(c.f, c.o) + '“ (aktuell: „' + fmtValue(c.f, t.v[c.f]) + '“).';
        btns = [['other', 'Abweichende übernehmen'], ['keep', 'Aktuelle behalten']];
      }
      var el = h('div', { class: 'banner warn conflict-box' }, [icon('conflict'), h('span', null, text)]);
      btns.forEach(function (b) {
        el.appendChild(h('button', { type: 'button', class: 'btn small', onclick: async function () {
          try { await A.resolveConflict(t.id, c.id, b[0]); } catch (e) { return; }
          var nt = S.tasks.get(t.id);
          render();
          if (nt) fillEdit(nt);
          if (b[0] === 'keep' && c.k !== 'value') { closeEdit(); }
          toast('Konflikt geklärt.');
        } }, b[1]));
      });
      box.appendChild(el);
    });
  }

  // onlyClean: nur Felder neu füllen, die im Fenster nicht gerade geändert werden (nach Synchronisation)
  function fillEdit(t, onlyClean) {
    var d = onlyClean ? E.dirty : {};
    if (!onlyClean) E.dirty = {};
    if (!d.title) $('eTitle').value = t.v.title;
    if (!d.patient && !(onlyClean && doc.activeElement === $('ePatient'))) E.picker.set(t.v.patientId);
    if (!d.type) { E.type = t.v.type; E.typeAuto = !!t.v.typeAuto; paintTypeChips($('eTypes'), E.type, false); }
    if (!d.recall) $('eRecall').value = t.v.recall || '';
    if (!d.deadline) $('eDeadline').value = t.v.deadline || '';
    if (!d.important) { E.important = !!t.v.important; paintToggle($('eImportant'), E.important, 'Wichtig'); }
    if (!d.status) { E.status = t.v.status === 'done' ? 'done' : 'open'; paintSeg($('eStatus'), E.status); }
    var loc = S.local.get(t.id);
    if (!d.note) $('eNote').value = loc && loc.note ? loc.note : '';
    $('eNoteField').hidden = S.isIOS && !(loc && loc.note);
    $('eNoteHidden').hidden = !$('eNoteField').hidden;
    renderEditConflicts(t);
    var pc = M.postponeCount(t);
    $('eMeta').textContent = 'Erstellt ' + D.fmtDateTime(t.v.createdAt) + ' · Geändert ' + D.fmtDateTime(t.u) +
      (pc ? ' · ' + pc + '× verschoben' : '') + (t.v.typeAuto ? ' · Art automatisch erkannt' : '');
  }

  function openEdit(id) {
    var t = S.tasks.get(id);
    if (!t) return;
    E.id = id; E.origRecall = t.v.recall; E.postponeCounted = false; E.dirty = {};
    E.picker.reset();
    fillEdit(t);
    setSaveState('');
    var dlg = $('dlgEdit');
    if (!dlg.open) dlg.showModal();
    $('eTitle').focus();
  }
  WV.ui.openEdit = openEdit;
  // Nach Synchronisation: offenes Bearbeitungsfenster aktualisieren, ohne laufende Eingaben zu überschreiben
  WV.ui.refreshEdit = function () {
    if (!$('dlgEdit').open || !E.id) return;
    var t = S.tasks.get(E.id);
    if (t) fillEdit(t, true);
  };

  function scheduleEditSave(delay) {
    if (E.saveTimer) clearTimeout(E.saveTimer);
    setSaveState('Änderungen …');
    E.saveTimer = setTimeout(function () { E.saveTimer = null; E.saving = E.saving.then(saveEdit); }, delay === undefined ? 450 : delay);
  }
  function flushEdit() {
    if (E.saveTimer) { clearTimeout(E.saveTimer); E.saveTimer = null; E.saving = E.saving.then(saveEdit); }
    return E.saving;
  }

  async function saveEdit() {
    var id = E.id;
    var t = S.tasks.get(id);
    if (!t) return;
    var ch = {};
    var dirty = E.dirty;
    var snap = { title: $('eTitle').value, patient: $('ePatient').value, recall: $('eRecall').value, deadline: $('eDeadline').value, note: $('eNote').value, type: E.type, important: E.important, status: E.status };
    var title = $('eTitle').value.trim();
    if (dirty.title) {
      if (!title) { setSaveState('Titel darf nicht leer sein – nicht gespeichert.', 'error'); return; }
      if (title !== t.v.title) ch.title = title;
    }
    var ptxt = $('ePatient').value.trim();
    if (!dirty.patient) { /* unverändert */ }
    else if (!ptxt) { if (t.v.patientId) ch.patient = null; }
    else {
      var sel = E.picker.selected || E.picker.resolve();
      if (sel && sel.id && sel.id !== t.v.patientId) ch.patient = { id: sel.id };
      else if (sel && sel.newLabel) ch.patient = { newLabel: sel.newLabel };
    }
    if (dirty.type && E.type !== t.v.type) { ch.type = E.type; ch.typeAuto = false; }
    var rv = $('eRecall').value || null;
    var countPostpone = false;
    if (dirty.recall && rv !== (t.v.recall || null)) {
      if (rv !== null && !saneDate(rv)) { setSaveState('Wiedervorlage: bitte ein gültiges Datum eingeben.', 'error'); return; }
      ch.recall = rv;
      if (rv && !E.postponeCounted && E.origRecall && D.diff(rv, E.origRecall) > 0) { countPostpone = true; E.postponeCounted = true; }
    }
    var dv = $('eDeadline').value;
    if (dirty.deadline && (dv || null) !== (t.v.deadline || null)) {
      if (dv && !saneDate(dv)) { setSaveState('Frist: bitte ein gültiges Datum eingeben.', 'error'); return; }
      ch.deadline = dv || null;
    }
    if (dirty.important && E.important !== !!t.v.important) ch.important = E.important;
    var curStatus = t.v.status === 'done' ? 'done' : 'open';
    if (dirty.status && E.status !== curStatus) ch.status = E.status;
    var loc = S.local.get(id);
    var note = $('eNote').value;
    var noteChanged = !!dirty.note && (note || '') !== ((loc && loc.note) || '');
    if (!Object.keys(ch).length && !noteChanged) { setSaveState('Gespeichert', 'ok'); return; }
    setSaveState('Speichert …');
    try {
      if (Object.keys(ch).length) {
        var out = await A.update(id, ch, { countPostpone: countPostpone });
        if (ch.patient && ch.patient.newLabel && out.newPatientId) E.picker.selected = { id: out.newPatientId };
      }
      if (noteChanged) await A.setLocal(id, { note: note || null });
      // gespeicherte Felder sind nicht mehr "in Bearbeitung" (sofern seither nicht weiter getippt)
      if (E.id === id) {
        var cur = { title: $('eTitle').value, patient: $('ePatient').value, recall: $('eRecall').value, deadline: $('eDeadline').value, note: $('eNote').value, type: E.type, important: E.important, status: E.status };
        Object.keys(dirty).forEach(function (k) { if (cur[k] === snap[k]) delete E.dirty[k]; });
      }
      setSaveState('Gespeichert', 'ok');
      render();
      var nt = S.tasks.get(id);
      if (nt && E.id === id) {
        renderEditConflicts(nt);
        var pc = M.postponeCount(nt);
        $('eMeta').textContent = 'Erstellt ' + D.fmtDateTime(nt.v.createdAt) + ' · Geändert ' + D.fmtDateTime(nt.u) + (pc ? ' · ' + pc + '× verschoben' : '');
      }
    } catch (e) {
      setSaveState('Nicht gespeichert – bitte erneut versuchen.', 'error');
    }
  }

  function closeEdit() {
    var dlg = $('dlgEdit');
    if (dlg.open) dlg.close();
  }

  function initEdit() {
    var dlg = $('dlgEdit');
    E.picker = PatientPicker($('ePatient'), $('ePatientList'), $('ePatientHint'), {
      onChange: function () { markDirty('patient'); scheduleEditSave(0); },
      onInput: function () { markDirty('patient'); }
    });
    buildTypeChips($('eTypes'), function (id) { E.type = id; markDirty('type'); paintTypeChips($('eTypes'), E.type, false); scheduleEditSave(0); });
    buildSeg($('eRecallPicks'), [['d', '+1 Tag'], ['w', '+1 Woche'], ['m', '+1 Monat']], function (unit) {
      var t = S.tasks.get(E.id);
      var base = $('eRecall').value && D.isValid($('eRecall').value) ? $('eRecall').value : (t ? t.v.recall : D.today());
      $('eRecall').value = D.postpone(base, D.today(), unit);
      markDirty('recall');
      scheduleEditSave(0);
    }, 'small');
    buildSeg($('eStatus'), STATUS_OPTS, function (v) { E.status = v; markDirty('status'); paintSeg($('eStatus'), v); scheduleEditSave(0); });
    $('eImportant').addEventListener('click', function () { E.important = !E.important; markDirty('important'); paintToggle($('eImportant'), E.important, 'Wichtig'); scheduleEditSave(0); });
    $('eTitle').addEventListener('input', function () { markDirty('title'); scheduleEditSave(); });
    $('eTitle').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); flushEdit().then(closeEdit); } });
    $('eRecall').addEventListener('change', function () { markDirty('recall'); scheduleEditSave(600); });
    $('eRecallClear').appendChild(icon('x'));
    $('eRecallClear').addEventListener('click', function () { $('eRecall').value = ''; markDirty('recall'); scheduleEditSave(0); });
    $('eDeadline').addEventListener('change', function () { markDirty('deadline'); scheduleEditSave(600); });
    $('eDeadlineClear').appendChild(icon('x'));
    $('eDeadlineClear').addEventListener('click', function () { $('eDeadline').value = ''; markDirty('deadline'); scheduleEditSave(0); });
    $('eNote').addEventListener('input', function () { markDirty('note'); scheduleEditSave(700); });
    $('eDelete').addEventListener('click', function () {
      var id = E.id;
      flushEdit().then(function () { closeEdit(); removeTask(id); });
    });
    Array.prototype.forEach.call(dlg.querySelectorAll('[data-close]'), function (b) {
      if (b.classList.contains('icon-btn')) b.appendChild(icon('x'));
      b.addEventListener('click', function () { flushEdit().then(closeEdit); });
    });
    dlg.addEventListener('cancel', function (e) {
      if (E.picker.isListOpen()) { e.preventDefault(); E.picker.close(); return; }
      e.preventDefault();
      flushEdit().then(closeEdit);
    });
    dlg.addEventListener('close', function () {
      flushEdit();
      var id = E.id;
      setTimeout(function () {
        var r = id ? $('list').querySelector('.task[data-id="' + cssEsc(id) + '"]') : null;
        if (r) r.focus({ preventScroll: false });
      }, 0);
    });
  }

  // ---------- Dialog-Hilfen ----------
  function dialogShell(dlg, headId, title, bodyChildren, footChildren) {
    clear(dlg);
    var closeBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Schließen (Esc)', onclick: function () { dlg.close(); } }, [icon('x')]);
    add(dlg, [
      h('div', { class: 'dlg-head' }, [h('h2', { id: headId }, title), closeBtn]),
      h('div', { class: 'dlg-body' }, bodyChildren),
      footChildren ? h('div', { class: 'dlg-foot' }, footChildren) : null
    ]);
  }

  // ---------- Einstellungen & Sicherung ----------
  function openSettings() {
    renderSettings();
    var dlg = $('dlgSettings');
    if (!dlg.open) dlg.showModal();
  }
  WV.ui.openSettings = openSettings;

  function kv(label, value, cls) {
    return h('div', { class: 'kv' + (cls ? ' ' + cls : '') }, [h('span', { class: 'k' }, label), h('span', { class: 'v' }, value)]);
  }

  async function backupNow() {
    var res;
    if (!Ctl.key) { openPass(); return; }
    if (Ctl.dir) res = await Ctl.writeNow(true);
    else res = await Ctl.download();
    if (res && res.message) toast(res.message, { level: res.ok ? '' : 'error', timeout: res.ok ? 4000 : 0 });
    render();
    if ($('dlgSettings').open) renderSettings();
  }

  function renderSettings() {
    var dlg = $('dlgSettings');
    var bs = Ctl.bs || {};
    var st = Ctl.status();
    var themeSeg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Farbschema' });
    buildSeg(themeSeg, [['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']], function (v) {
      S.ui.theme = v; saveUi(); applyTheme(); paintSeg(themeSeg, v);
    });
    paintSeg(themeSeg, S.ui.theme);

    var keyPart = Ctl.key
      ? [kv('Verschlüsselung', 'eingerichtet (AES-256-GCM, Schlüssel ' + Ctl.keyInfo.keyId.slice(0, 6) + '…)'),
        h('div', { class: 'btn-row' }, [h('button', { type: 'button', class: 'btn small', onclick: function () { openPass(); } }, 'Neue Passphrase festlegen')])]
      : [h('p', { class: 'banner warn' }, [icon('lock'), h('span', null, 'Für Sicherungen ist eine Passphrase nötig. Die Sicherungsdateien werden damit verschlüsselt.')]),
        h('div', { class: 'btn-row' }, [h('button', { type: 'button', class: 'btn primary', onclick: function () { openPass(); } }, [icon('lock'), 'Passphrase festlegen'])])];

    var folderPart;
    if (!B.supportsFolder()) {
      folderPart = [h('p', { class: 'muted' }, S.isFile && root.showDirectoryPicker === undefined
        ? 'Automatische Ordner-Sicherung ist in diesem Browser nicht verfügbar. Bitte regelmäßig „Sicherung herunterladen“ verwenden.'
        : 'Automatische Ordner-Sicherung ist in diesem Browser nicht verfügbar (z. B. Safari). Bitte „Sicherung herunterladen“ verwenden.')];
    } else if (!Ctl.dir) {
      folderPart = [
        h('p', { class: 'muted' }, 'Empfohlen: einen eigenen Ordner auf dem persönlichen Netzlaufwerk wählen, z. B. H:\\Documents\\Wiedervorlage-Sicherung. Die Sicherung wird dann nach jeder Änderung automatisch aktualisiert.'),
        h('div', { class: 'btn-row' }, [h('button', { type: 'button', class: 'btn primary', onclick: async function () {
          var r = await Ctl.connectFolder(); if (r.message) toast(r.message, { level: r.ok ? '' : 'error', timeout: r.ok ? 4000 : 0 }); render(); renderSettings();
        } }, [icon('folder'), 'Sicherungsordner wählen'])])
      ];
    } else {
      folderPart = [
        kv('Ordner', (Ctl.dir.name || bs.folderName || '–') + (Ctl.perm === 'granted' ? ' · erreichbar' : ' · Zugriff muss bestätigt werden'), Ctl.perm === 'granted' ? '' : 'warn'),
        h('div', { class: 'btn-row' }, [
          Ctl.perm !== 'granted' ? h('button', { type: 'button', class: 'btn primary', onclick: async function () {
            var r = await Ctl.reconnect(); if (r.message) toast(r.message, { level: r.ok ? '' : 'error' }); render(); renderSettings();
          } }, [icon('folder'), 'Wieder verbinden']) : null,
          h('button', { type: 'button', class: 'btn', onclick: backupNow }, 'Jetzt sichern'),
          h('button', { type: 'button', class: 'btn small link', onclick: async function () {
            var r = await Ctl.connectFolder(); if (r.message) toast(r.message, { level: r.ok ? '' : 'error' }); render(); renderSettings();
          } }, 'Anderen Ordner wählen')
        ])
      ];
    }

    var statusPart = [
      kv('Status', st.text, st.level === 'error' ? 'error' : (st.level === 'warn' ? 'warn' : '')),
      kv('Letzte erfolgreiche Sicherung', bs.lastOkAt ? D.fmtDateTime(bs.lastOkAt) + (bs.lastOkKind === 'download' ? ' (heruntergeladen)' : ' (Ordner, geprüft)') : 'noch keine'),
      kv('Ungesicherte Änderungen', Ctl.dirty() ? 'ja' + (bs.firstUnbackedAt ? ', seit ' + D.fmtDateTime(bs.firstUnbackedAt) : '') : 'nein'),
      bs.lastError ? kv('Letzter Fehler', bs.lastError + ' (' + D.fmtDateTime(bs.lastErrorAt) + ')', 'error') : null
    ];

    var counts = { open: 0, done: 0, deleted: 0 };
    S.tasks.forEach(function (t) { if (t.v.purged) return; if (t.v.deleted) counts.deleted++; else if (t.v.status === 'done') counts.done++; else counts.open++; });

    var body = syncSection().concat([
      h('h3', null, 'Sicherung'),
      h('div', { class: 'card inner' }, statusPart),
      h('div', { class: 'card inner' }, keyPart),
      h('div', { class: 'card inner' }, [h('h4', null, 'Automatische Sicherung in einen Ordner')].concat(folderPart)),
      h('div', { class: 'card inner' }, [
        h('h4', null, 'Von Hand'),
        h('div', { class: 'btn-row' }, [
          h('button', { type: 'button', class: 'btn', onclick: async function () {
            var r = await Ctl.download(); if (r.message) toast(r.message, { level: r.ok ? '' : 'error', timeout: r.ok ? 5000 : 0 }); render(); renderSettings();
          } }, [icon('download'), 'Sicherung herunterladen']),
          h('button', { type: 'button', class: 'btn', onclick: function () { $('dlgSettings').close(); openImport(); } }, [icon('upload'), 'Sicherung laden']),
          B.supportsFolder() ? h('button', { type: 'button', class: 'btn', onclick: function () { $('dlgSettings').close(); openImport({ fromFolder: true }); } }, [icon('folder'), 'Aus Ordner wiederherstellen']) : null
        ]),
        h('p', { class: 'muted' }, 'Beim Laden werden die Daten geprüft und mit dem vorhandenen Bestand zusammengeführt – nichts wird blind überschrieben.')
      ]),
      h('h3', null, 'Darstellung'),
      h('div', { class: 'card inner' }, [h('div', { class: 'kv' }, [h('span', { class: 'k' }, 'Farbschema'), themeSeg])]),
      h('h3', null, 'Tastatur'),
      h('div', { class: 'card inner keys' }, [
        kv('N', 'Neue Aufgabe (Fokus in die Schnelleingabe)'),
        kv('/', 'Suchen'),
        kv('Enter', 'Speichern bzw. Aufgabe öffnen'),
        kv('↑ ↓', 'In der Liste bewegen'),
        kv('E', 'Erledigt'),
        kv('T · W · M', '+1 Tag · +1 Woche · +1 Monat'),
        kv('Entf', 'Löschen (mit Rückgängig)'),
        kv('Esc', 'Bearbeitung schließen · Suche leeren')
      ]),
      h('h3', null, 'Gerät'),
      h('div', { class: 'card inner' }, [
        kv('Aufgaben', counts.open + ' offen · ' + counts.done + ' erledigt' + (counts.deleted ? ' · ' + counts.deleted + ' gelöscht (Löschmarker)' : '')),
        kv('Dauerhafter Speicher', S.persisted === true ? 'vom Browser zugesagt' : (S.persisted === false ? 'nicht zugesagt – Sicherung besonders wichtig' : 'unbekannt')),
        kv('Ausführung', S.isFile ? 'Lokale Datei (ohne Synchronisation)' : root.location.host),
        kv('Version', WV.VERSION),
        S.isFile ? null : h('p', null, [h('a', { href: 'verbindungstest.html', class: 'btn small' }, 'Verbindungstest Google Drive')]),
        h('p', { class: 'muted' }, 'Organisatorische Wiedervorlage nicht dringender Aufgaben. Kein Patientenaktensystem, kein Befundarchiv, keine Alarmierung, keine medizinische Entscheidungsunterstützung. Patientenbezug nur als „Nachname, Initiale“.')
      ])
    ]);
    dialogShell(dlg, 'sHead', 'Einstellungen und Sicherung', body);
  }

  // ---------- Passphrase ----------
  // opts.forSync: Ersteinrichtung der Synchronisation (Schlüssel wird danach in Google Drive abgelegt)
  function openPass(opts) {
    opts = opts || {};
    var dlg = $('dlgPass');
    var existing = !!Ctl.key;
    var syncOn = WV.sync && WV.sync.enabled();
    var p1 = h('input', { type: 'password', id: 'pass1', autocomplete: 'new-password', spellcheck: 'false' });
    var p2 = h('input', { type: 'password', id: 'pass2', autocomplete: 'new-password', spellcheck: 'false' });
    var show = h('input', { type: 'checkbox', id: 'passShow' });
    var ack = h('input', { type: 'checkbox', id: 'passAck' });
    var err = h('p', { class: 'hint-line warn', 'aria-live': 'polite' });
    var okBtn = h('button', { type: 'button', class: 'btn primary' }, 'Festlegen');
    show.addEventListener('change', function () { p1.type = p2.type = show.checked ? 'text' : 'password'; });
    async function submit() {
      err.textContent = '';
      if (p1.value.length < 12) { err.textContent = 'Bitte mindestens 12 Zeichen verwenden – empfohlen sind 5–6 zufällige Wörter.'; p1.focus(); return; }
      if (p1.value !== p2.value) { err.textContent = 'Die beiden Eingaben stimmen nicht überein.'; p2.focus(); return; }
      if (!ack.checked) { err.textContent = 'Bitte bestätigen, dass die Passphrase notiert ist.'; ack.focus(); return; }
      okBtn.disabled = true; okBtn.textContent = 'Schlüssel wird erzeugt …';
      try {
        var r = await Ctl.setupKey(p1.value);
        p1.value = ''; p2.value = '';
        if (opts.forSync) await WV.sync.enable({ keyPendingUpload: true });
        else if (syncOn) await WV.sync.onKeyChanged();
        dlg.close();
        toast(opts.forSync ? 'Passphrase festgelegt. Die Synchronisation ist eingerichtet.' :
          (r && r.message ? r.message : 'Passphrase festgelegt. Sicherungen werden jetzt verschlüsselt.'), { level: r && r.ok === false ? 'error' : '', timeout: 5000 });
        render();
        if ($('dlgSettings').open) renderSettings();
        if (opts.forSync || syncOn) WV.sync.syncNow().then(afterSync);
      } catch (e) {
        err.textContent = 'Der Schlüssel konnte nicht erzeugt werden.';
        okBtn.disabled = false; okBtn.textContent = 'Festlegen';
      }
    }
    okBtn.addEventListener('click', submit);
    [p1, p2].forEach(function (el) { el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } }); });
    dialogShell(dlg, 'pHead', opts.forSync ? 'Passphrase für Synchronisation und Sicherung' : (existing ? 'Neue Passphrase festlegen' : 'Passphrase für die Sicherung'), [
      h('p', null, opts.forSync
        ? 'Die Aufgaben werden vor der Übertragung zu Google Drive mit dieser Passphrase verschlüsselt. Dieselbe Passphrase gibst du später einmal auf dem iPhone ein. Sie wird nirgends gespeichert.'
        : 'Sicherungsdateien werden mit dieser Passphrase verschlüsselt. Die Passphrase selbst wird nirgends gespeichert.'),
      existing ? h('p', { class: 'muted' }, 'Bereits vorhandene Sicherungsdateien lassen sich weiterhin nur mit der bisherigen Passphrase öffnen.') : null,
      syncOn && existing ? h('p', { class: 'muted' }, 'Die Synchronisation ist eingerichtet: Auf den anderen Geräten musst du danach die neue Passphrase einmal eingeben.') : null,
      h('p', { class: 'muted' }, 'Empfehlung: 5–6 zufällige Wörter. Ohne die Passphrase ist eine Sicherung nicht wiederherstellbar – niemand kann sie zurücksetzen.'),
      h('label', { class: 'field' }, [h('span', { class: 'opt-label' }, 'Passphrase'), p1]),
      h('label', { class: 'field' }, [h('span', { class: 'opt-label' }, 'Wiederholen'), p2]),
      h('label', { class: 'check' }, [show, ' Eingabe anzeigen']),
      h('label', { class: 'check' }, [ack, ' Ich habe die Passphrase sicher notiert (z. B. auf Papier, zu Hause).']),
      err
    ], [h('button', { type: 'button', class: 'btn', onclick: function () { dlg.close(); } }, 'Abbrechen'), okBtn]);
    if (!dlg.open) dlg.showModal();
    p1.focus();
  }
  WV.ui.openPass = openPass;

  // ---------- Synchronisation ----------
  var Y = WV.sync, AU = WV.auth;

  function syncSection() {
    var out = [h('h3', null, 'Synchronisation (Google Drive)')];
    if (!AU.available()) {
      out.push(h('div', { class: 'card inner' }, [h('p', { class: 'muted' }, S.isFile
        ? 'In der lokalen Datei ist keine Synchronisation möglich. Bitte die Online-Version verwenden: https://ben90ld.github.io/wiedervorlage_pia/'
        : 'Synchronisation ist hier nicht verfügbar.')]));
      return out;
    }
    if (!Y.enabled()) {
      out.push(h('div', { class: 'card inner' }, [
        h('p', null, 'Klinik-PC und iPhone verwenden dann denselben Aufgabenbestand. Die Aufgaben werden vor der Übertragung mit deiner Passphrase verschlüsselt und nur im versteckten App-Ordner deines Google Drive abgelegt. Notizen bleiben auf dem jeweiligen Gerät.'),
        h('div', { class: 'btn-row' }, [h('button', { type: 'button', class: 'btn primary', id: 'btnSyncSetup', onclick: function () { goGoogle('select_account', 'setup'); } }, 'Synchronisation einrichten')])
      ]));
      return out;
    }
    var c = Y.cfg(), st = Y.status(), exp = AU.expiresAt();
    var others = Object.keys(c.others || {}).map(function (k) { var o = c.others[k]; return o.label + ' (Stand ' + (o.exportedAt ? D.fmtDateTime(o.exportedAt) : '–') + ')'; });
    var auto = h('input', { type: 'checkbox', id: 'syncAuto' });
    auto.checked = c.autoConnect !== false;
    auto.addEventListener('change', function () { Y.setAutoConnect(auto.checked); });
    out.push(h('div', { class: 'card inner' }, [
      kv('Status', st.text, st.level === 'error' ? 'error' : (st.level === 'warn' ? 'warn' : '')),
      kv('Letzter Abgleich', c.lastSyncAt ? D.fmtDateTime(c.lastSyncAt) : 'noch keiner'),
      kv('Google-Anmeldung', AU.token() ? 'aktiv bis ' + D.fmtDateTime(new Date(exp).toISOString()).slice(-5) : 'abgelaufen – wird bei Bedarf erneuert'),
      kv('Weitere Geräte', others.length ? others.join(', ') : 'noch keine'),
      kv('Nicht synchronisiert', 'Notizen (bleiben auf dem jeweiligen Gerät)'),
      Y.skipped() ? kv('Übersprungen', Y.skipped() + ' Gerätedatei(en) mit älterer Passphrase', 'warn') : null,
      c.lastError ? kv('Letzter Fehler', c.lastError.message + ' (' + D.fmtDateTime(c.lastError.at) + ')', 'error') : null,
      h('label', { class: 'check-row' }, [auto, ' Beim Öffnen automatisch mit Google verbinden (kurzer Wechsel zu Google und zurück)']),
      h('div', { class: 'btn-row' }, [
        h('button', { type: 'button', class: 'btn primary', onclick: function () { syncNowUi(true); } }, 'Jetzt synchronisieren'),
        h('button', { type: 'button', class: 'btn', onclick: function () { goGoogle('select_account', 'manual'); } }, 'Neu bei Google anmelden'),
        h('button', { type: 'button', class: 'btn small link', onclick: async function () {
          await Y.disable(); toast('Synchronisation auf diesem Gerät beendet. Die Daten auf diesem Gerät bleiben erhalten.'); render(); renderSettings();
        } }, 'Synchronisation auf diesem Gerät beenden')
      ])
    ]));
    return out;
  }

  function showOverlay(text) { $('overlayText').textContent = text || 'Verbinde mit Google …'; $('overlay').hidden = false; }
  function hideOverlay() { $('overlay').hidden = true; }

  // Zu Google wechseln – vorher alle offenen Eingaben speichern
  function goGoogle(prompt, purpose) {
    if (!root.navigator.onLine) { toast('Keine Internetverbindung.', { level: 'warn' }); return; }
    showOverlay('Verbinde mit Google …');
    Promise.resolve(flushEdit()).then(function () {
      saveDraft();
      AU.start(prompt, purpose);
    });
  }
  WV.ui.goGoogle = goGoogle;

  // Läuft gerade eine Eingabe? Dann nicht automatisch zu Google wechseln.
  function isBusy() {
    if (doc.querySelector('dialog[open]')) return true;
    if (Q.saving || E.saveTimer) return true;
    if ($('qTitle').value.trim() || $('qPatient').value.trim()) return true;
    var a = doc.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.id !== 'search' && a.id !== 'qTitle') return true;
    return false;
  }

  async function maybeAutoConnect() {
    var c = Y.cfg();
    if (!Y.enabled() || AU.token() || c.autoConnect === false) return false;
    if (!root.navigator.onLine || doc.visibilityState !== 'visible' || Y.needKey()) return false;
    if (!AU.mayAutoConnect() || isBusy()) return false;
    var reachable = await AU.probe(2500);
    if (!reachable || isBusy() || AU.token()) return false;
    goGoogle('none', 'auto');
    return true;
  }

  function afterSync(r) {
    if (!r) return;
    if (r.ok) { renderSyncPill(); if ($('dlgSettings').open) renderSettings(); return; }
    if (r.code === 'KEY') { openUnlock(); return; }
    renderSyncPill();
    if ($('dlgSettings').open) renderSettings();
  }

  async function syncNowUi(manual) {
    var st = Y.status();
    if (st.code === 'auth') { goGoogle(AU.silentFailed() ? 'select_account' : 'none', 'manual'); return; }
    if (st.code === 'key') { openUnlock(); return; }
    var r = await Y.syncNow();
    afterSync(r);
    if (manual) {
      if (r.ok) toast('Synchronisiert.' + (r.stats && r.stats.files ? ' ' + r.stats.tasksNew + ' neu, ' + r.stats.tasksUpdated + ' aktualisiert.' : ''), { timeout: 2500 });
      else if (r.code === 'offline') toast('Offline – die Änderungen werden später übertragen.', { level: 'warn' });
      else if (r.code !== 'KEY' && r.code !== 'busy' && r.code !== 'auth') toast(r.message || 'Synchronisation fehlgeschlagen.', { level: 'error', timeout: 6000 });
    }
  }
  WV.ui.syncNow = syncNowUi;

  function renderSyncPill() {
    var pill = $('syncPill');
    var st = Y.status();
    if (st.code === 'off' || st.code === 'unavailable') { pill.hidden = true; return; }
    pill.hidden = false;
    var conflicts = S.view ? S.view.counts.conflicts : 0;
    var text = st.text, level = st.level, ic = st.code === 'ok' ? 'check' : (st.code === 'error' ? 'alert' : (st.code === 'key' ? 'lock' : 'restore'));
    if (conflicts && (st.code === 'ok' || st.code === 'pending')) { text = conflicts + ' Konflikt' + (conflicts > 1 ? 'e' : '') + ' prüfen'; level = 'warn'; ic = 'conflict'; }
    clear(pill);
    pill.className = 'pill lvl-' + level;
    add(pill, [icon(ic), h('span', { class: 'pill-text' }, text)]);
    pill.title = 'Synchronisation: ' + text;
    pill.setAttribute('data-code', conflicts && (st.code === 'ok' || st.code === 'pending') ? 'conflict' : st.code);
  }
  WV.ui.renderSyncPill = renderSyncPill;

  function onSyncPill() {
    var code = $('syncPill').getAttribute('data-code');
    if (code === 'conflict') {
      var first = Array.from(S.tasks.values()).find(function (t) { return M.openConflicts(t).length > 0; });
      if (first) openEdit(first.id);
      return;
    }
    if (code === 'error' || code === 'offline') { openSettings(); if (code === 'error') syncNowUi(false); return; }
    syncNowUi(true);
  }

  // Passphrase eines anderen Geräts eingeben (Schlüssel liegt in Google Drive)
  function openUnlock(pre) {
    var need = pre || Y.needKey();
    if (!need || !need.info) {
      toast('Für die Synchronisation fehlt der Schlüssel. Bitte in den Einstellungen „Neu bei Google anmelden“.', { level: 'warn', timeout: 6000 });
      return;
    }
    var dlg = $('dlgPass');
    var p = h('input', { type: 'password', id: 'unlockPass', autocomplete: 'current-password', spellcheck: 'false' });
    var err = h('p', { class: 'hint-line warn', 'aria-live': 'polite' });
    var okBtn = h('button', { type: 'button', class: 'btn primary' }, 'Entsperren');
    async function submit() {
      if (!p.value) { p.focus(); return; }
      okBtn.disabled = true; okBtn.textContent = 'Prüfe …'; err.textContent = '';
      try {
        await Y.unlockWith(p.value, need.info);
        p.value = '';
        dlg.close();
        toast('Passphrase übernommen. Synchronisiere …', { timeout: 3000 });
        var r = await Y.syncNow();
        afterSync(r);
        render();
      } catch (e) {
        err.textContent = e && e.code === 'WRONG_PASSPHRASE' ? 'Passphrase falsch. Bitte erneut versuchen.' : 'Die Passphrase konnte nicht geprüft werden.';
        okBtn.disabled = false; okBtn.textContent = 'Entsperren';
        p.focus();
      }
    }
    okBtn.addEventListener('click', submit);
    p.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    dialogShell(dlg, 'pHead', 'Passphrase der Synchronisation', [
      h('p', null, 'In Google Drive liegen Aufgaben, die mit einer Passphrase verschlüsselt sind (eingerichtet auf einem anderen Gerät oder dort geändert). Bitte diese Passphrase einmal eingeben.'),
      Ctl.key ? h('p', { class: 'muted' }, 'Die Sicherungen dieses Geräts verwenden danach ebenfalls diese Passphrase. Ältere Sicherungsdateien lassen sich weiterhin mit der bisherigen Passphrase öffnen.') : null,
      h('label', { class: 'field' }, [h('span', { class: 'opt-label' }, 'Passphrase'), p]),
      err
    ], [h('button', { type: 'button', class: 'btn', onclick: function () { dlg.close(); } }, 'Später'), okBtn]);
    if (!dlg.open) dlg.showModal();
    p.focus();
  }
  WV.ui.openUnlock = openUnlock;

  // Rückkehr von Google auswerten (beim Start)
  WV.ui.handleAuthReturn = async function (ret) {
    hideOverlay();
    if (!ret) return startupSync();
    if (ret.error) {
      if (ret.purpose === 'setup') { toast(AU.errorText(ret.error), { level: 'error', timeout: 0 }); return; }
      if (ret.prompt === 'none') {
        S.authBanner = AU.errorText(ret.error);
        renderBanners();
        return;
      }
      toast(AU.errorText(ret.error), { level: 'error', timeout: 8000 });
      return;
    }
    S.authBanner = null;
    if (ret.purpose === 'setup') {
      showOverlay('Synchronisation wird eingerichtet …');
      var res;
      try { res = await Y.continueSetup(); } catch (e) { hideOverlay(); toast('Einrichtung fehlgeschlagen: ' + (e.message || 'Fehler'), { level: 'error', timeout: 0 }); return; }
      hideOverlay();
      if (res.need === 'create') { openPass({ forSync: true }); return; }
      if (res.need === 'unlock') { openUnlock({ info: res.info }); return; }
      toast(res.usedExisting ? 'Synchronisation eingerichtet. Es gilt die Passphrase deiner Sicherung.' : 'Synchronisation eingerichtet.', { timeout: 5000 });
    }
    var r = await Y.syncNow();
    afterSync(r);
  };

  function startupSync() {
    if (!Y.enabled()) return;
    if (AU.token()) Y.syncNow().then(afterSync);
    else maybeAutoConnect();
  }

  WV.ui.initSync = function () {
    $('syncPill').addEventListener('click', onSyncPill);
    Y.onStatus = function () { renderSyncPill(); };
    Y.onNeedKey = function () { renderSyncPill(); };
    Y.onMerged = function (stats) {
      return WV.ui.loadState().then(function () {
        render();
        WV.ui.refreshEdit();
        var parts = [];
        if (stats.tasksNew) parts.push(stats.tasksNew + ' neu');
        if (stats.tasksUpdated) parts.push(stats.tasksUpdated + ' geändert');
        if (stats.conflicts) parts.push(stats.conflicts + ' Konflikt' + (stats.conflicts > 1 ? 'e' : '') + ' zu prüfen');
        if (parts.length) toast('Vom anderen Gerät übernommen: ' + parts.join(', ') + '.', { timeout: 4000 });
      });
    };
    var lastResume = 0;
    doc.addEventListener('visibilitychange', function () {
      if (doc.visibilityState !== 'visible' || !Y.enabled()) return;
      var now = Date.now();
      if (now - lastResume < 30000) return;
      lastResume = now;
      if (AU.token()) Y.syncNow().then(afterSync); else maybeAutoConnect();
    });
    root.addEventListener('online', function () { renderSyncPill(); if (Y.enabled()) { if (AU.token()) Y.syncNow().then(afterSync); else maybeAutoConnect(); } });
    root.addEventListener('offline', renderSyncPill);
    setInterval(function () {
      if (doc.visibilityState === 'visible' && Y.enabled() && AU.token()) Y.syncNow().then(afterSync);
      else renderSyncPill();
    }, Y.PERIOD);
    // bfcache: nach "Zurück" von Google ohne Neuladen
    root.addEventListener('pageshow', function (e) { if (e.persisted) hideOverlay(); });
  };

  // ---------- Import / Wiederherstellung ----------
  function openImport(opts) {
    opts = opts || {};
    var dlg = $('dlgImport');
    var ctx = { text: null, name: null, dir: null, opened: null };

    function stepPick() {
      var file = h('input', { type: 'file', accept: '.json,application/json', id: 'importFile', class: 'file-input' });
      var err = h('p', { class: 'hint-line warn', 'aria-live': 'polite' });
      file.addEventListener('change', async function () {
        var f = file.files && file.files[0];
        if (!f) return;
        if (f.size > 50 * 1024 * 1024) { err.textContent = 'Die Datei ist zu groß für eine Wiedervorlage-Sicherung.'; return; }
        try { ctx.text = await f.text(); ctx.name = f.name; } catch (e) { err.textContent = 'Die Datei konnte nicht gelesen werden.'; return; }
        tryOpen(null, err);
      });
      var body = [
        h('p', null, 'Wähle eine Sicherungsdatei (Wiedervorlage_….json). Die Daten werden geprüft und vor dem Zusammenführen angezeigt.'),
        h('label', { class: 'btn primary file-label' }, [icon('upload'), 'Datei auswählen', file]),
        err
      ];
      if (B.supportsFolder()) {
        body.splice(2, 0, h('button', { type: 'button', class: 'btn', onclick: function () { fromFolder(err); } }, [icon('folder'), 'Aus Sicherungsordner laden']));
      }
      dialogShell(dlg, 'iHead', 'Sicherung laden', body, [h('button', { type: 'button', class: 'btn', onclick: function () { dlg.close(); } }, 'Abbrechen')]);
    }

    async function fromFolder(err) {
      try {
        ctx.dir = await root.showDirectoryPicker({ id: 'wiedervorlage', mode: 'readwrite', startIn: 'documents' });
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        if (!dlg.open) { stepPick(); dlg.showModal(); }
        var el0 = dlg.querySelector('.hint-line.warn');
        if (el0) el0.textContent = 'Der Ordner kann nicht geöffnet werden.';
        return;
      }
      try {
        var r = await B.readFromFolder(ctx.dir);
        ctx.text = r.text; ctx.name = r.name;
      } catch (e) {
        if (!dlg.open) { stepPick(); dlg.showModal(); }
        var el = dlg.querySelector('.hint-line.warn');
        if (el) el.textContent = e.message || 'Keine Sicherung gefunden.';
        return;
      }
      if (!dlg.open) { stepPick(); dlg.showModal(); }
      tryOpen(null, dlg.querySelector('.hint-line.warn'));
    }

    async function tryOpen(pass, err) {
      try {
        ctx.opened = await B.openFile(ctx.text, pass);
        stepPreview();
      } catch (e) {
        if (e.code === 'NEED_PASSPHRASE') stepPass();
        else if (e.code === 'WRONG_PASSPHRASE') stepPass('Passphrase falsch. Bitte erneut versuchen.');
        else if (err) err.textContent = e.message || 'Die Sicherung konnte nicht geöffnet werden.';
      }
    }

    function stepPass(msg) {
      var p = h('input', { type: 'password', id: 'importPass', autocomplete: 'current-password', spellcheck: 'false' });
      var err = h('p', { class: 'hint-line warn', 'aria-live': 'polite' }, msg || '');
      var btn = h('button', { type: 'button', class: 'btn primary' }, 'Entsperren');
      async function go() {
        if (!p.value) { p.focus(); return; }
        btn.disabled = true; btn.textContent = 'Prüfe …';
        await tryOpen(p.value, err);
        btn.disabled = false; btn.textContent = 'Entsperren';
      }
      btn.addEventListener('click', go);
      p.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      dialogShell(dlg, 'iHead', 'Passphrase der Sicherung', [
        h('p', null, 'Datei: ' + (ctx.name || 'Sicherung')),
        h('p', { class: 'muted' }, 'Diese Sicherung wurde mit einer Passphrase verschlüsselt. Bitte die damals festgelegte Passphrase eingeben.'),
        h('label', { class: 'field' }, [h('span', { class: 'opt-label' }, 'Passphrase'), p]),
        err
      ], [h('button', { type: 'button', class: 'btn', onclick: function () { dlg.close(); } }, 'Abbrechen'), btn]);
      p.focus();
    }

    function stepPreview() {
      var o = ctx.opened;
      var pv = B.preview({ tasks: S.tasks, patients: S.patients, local: S.local }, o.payload);
      var s = pv.stats;
      var list = function (title, arr) {
        if (!arr.length) return null;
        return h('div', null, [h('h4', null, title), h('ul', { class: 'plain' }, arr.map(function (t) { return h('li', null, t); }))]);
      };
      var nothing = s.tasksNew + s.tasksUpdated + s.patientsNew + s.patientsUpdated + s.notesUpdated + s.conflicts === 0;
      var applyBtn = h('button', { type: 'button', class: 'btn primary' }, nothing ? 'Schließen' : 'Zusammenführen');
      applyBtn.addEventListener('click', async function () {
        if (nothing) { dlg.close(); return; }
        applyBtn.disabled = true; applyBtn.textContent = 'Wird zusammengeführt …';
        try {
          var res = await B.apply(o.payload);
          if (!Ctl.key) await Ctl.adoptKey(o.header.key, o.key);
          if (ctx.dir && !Ctl.dir) {
            Ctl.dir = ctx.dir;
            await DB.setMeta('backupDir', ctx.dir);
            Ctl.perm = await B.permission(ctx.dir, false);
          }
          await WV.ui.loadState();
          await Ctl.refresh();
          if (res.records && typeof res.records.changeSeq === 'number') Ctl.noteChange(res.records.changeSeq);
          dlg.close();
          render();
          toast('Sicherung zusammengeführt: ' + res.stats.tasksNew + ' neu, ' + res.stats.tasksUpdated + ' aktualisiert' +
            (res.stats.conflicts ? ', ' + res.stats.conflicts + ' Konflikt(e) zur Prüfung' : '') + '.', { timeout: 6000 });
        } catch (e) {
          applyBtn.disabled = false; applyBtn.textContent = 'Zusammenführen';
          toast('Zusammenführen fehlgeschlagen. Der bisherige Datenbestand ist unverändert.', { level: 'error', timeout: 0 });
        }
      });
      dialogShell(dlg, 'iHead', 'Vorschau der Sicherung', [
        h('div', { class: 'card inner' }, [
          kv('Datei', ctx.name || '–'),
          kv('Erstellt', D.fmtDateTime(o.header.createdAt) + ' · App-Version ' + (o.header.appVersion || '?')),
          kv('Inhalt', pv.totals.open + ' offene, ' + pv.totals.done + ' erledigte Aufgaben · ' + pv.totals.patients + ' Patientenkürzel'),
          o.usedLocal ? kv('Schlüssel', 'mit dem Schlüssel dieses Geräts geöffnet') : kv('Schlüssel', 'mit Passphrase entsperrt' + (Ctl.key ? '' : ' – wird für künftige Sicherungen übernommen'))
        ]),
        h('div', { class: 'card inner' }, [
          h('h4', null, 'Was passiert beim Zusammenführen'),
          kv('Neue Aufgaben', String(s.tasksNew)),
          kv('Aktualisierte Aufgaben', String(s.tasksUpdated)),
          kv('Unverändert oder hier bereits neuer', String(s.tasksSame)),
          kv('Notizen übernommen', String(s.notesUpdated)),
          kv('Konflikte zur Prüfung', String(s.conflicts), s.conflicts ? 'warn' : ''),
          pv.totals.skipped ? kv('Fehlerhafte Einträge (übersprungen)', String(pv.totals.skipped), 'warn') : null
        ]),
        list('Neu (Auszug)', pv.samples.added),
        list('Aktualisiert (Auszug)', pv.samples.updated),
        nothing ? h('p', { class: 'muted' }, 'Diese Sicherung enthält nichts, was hier nicht bereits vorhanden oder neuer ist.') : null
      ], [h('button', { type: 'button', class: 'btn', onclick: function () { dlg.close(); } }, 'Abbrechen'), applyBtn]);
      applyBtn.focus();
    }

    if (opts.fromFolder) {
      fromFolder(null);
      return;
    }
    stepPick();
    if (!dlg.open) dlg.showModal();
  }
  WV.ui.openImport = openImport;

  // ---------- Darstellung ----------
  function applyTheme() {
    doc.documentElement.setAttribute('data-theme', S.ui.theme || 'auto');
  }
  WV.ui.applyTheme = applyTheme;

  // ---------- Service Worker / Updates ----------
  function applyUpdate() {
    flushEdit();
    Ctl.flush();
    if (S.swWaiting) { S.swUpdating = true; S.swWaiting.postMessage('skipWaiting'); }
  }
  WV.ui.initSW = function () {
    if (!('serviceWorker' in root.navigator)) return;
    var host = root.location.hostname;
    if (root.location.protocol !== 'https:' && host !== 'localhost' && host !== '127.0.0.1') return;
    root.navigator.serviceWorker.register('sw.js').then(function (reg) {
      function check() {
        if (reg.waiting && root.navigator.serviceWorker.controller) { S.swWaiting = reg.waiting; renderBanners(); }
      }
      check();
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (nw) nw.addEventListener('statechange', function () { if (nw.state === 'installed') check(); });
      });
      doc.addEventListener('visibilitychange', function () { if (doc.visibilityState === 'visible') reg.update().catch(function () { /* offline */ }); });
    }).catch(function () { /* ohne Offline-Cache weiter */ });
    root.navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (S.swUpdating) { S.swUpdating = false; root.location.reload(); }
    });
  };

  // ---------- Tastatur ----------
  function focusRowRel(rowEl, delta) {
    var rows = Array.prototype.slice.call($('list').querySelectorAll('.task'));
    var i = rows.indexOf(rowEl);
    var n = rows[i + delta];
    if (n) n.focus();
  }

  function onKey(e) {
    if (e.defaultPrevented || e.isComposing) return;
    if (doc.querySelector('dialog[open]')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    var editable = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (editable) return;
    var k = e.key;
    if (k === 'n' || k === 'N') { e.preventDefault(); $('qTitle').focus(); return; }
    if (k === '/') { e.preventDefault(); $('search').focus(); $('search').select(); return; }
    var rowEl = t && t.closest ? t.closest('.task') : null;
    if (!rowEl) return;
    var id = rowEl.getAttribute('data-id');
    var isDoneRow = !!rowEl.getAttribute('data-done');
    if (k === 'ArrowDown') { e.preventDefault(); focusRowRel(rowEl, 1); return; }
    if (k === 'ArrowUp') { e.preventDefault(); focusRowRel(rowEl, -1); return; }
    if (t !== rowEl) return; // Tasten auf Schaltflächen nicht umdeuten
    if (isDoneRow) {
      if (k === 'Enter') { e.preventDefault(); doAct(id, 'restore'); }
      return;
    }
    var lower = k.toLowerCase();
    if (k === 'Enter' || k === ' ') { e.preventDefault(); openEdit(id); }
    else if (lower === 'e' || lower === 'x') { e.preventDefault(); doAct(id, 'done'); }
    else if (lower === 't') { e.preventDefault(); doAct(id, 'pp-d'); }
    else if (lower === 'w') { e.preventDefault(); doAct(id, 'pp-w'); }
    else if (lower === 'm') { e.preventDefault(); doAct(id, 'pp-m'); }
    else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); removeTask(id); }
  }

  // ---------- Start ----------
  WV.ui.init = function () {
    applyTheme();
    $('btnSettings').appendChild(icon('settings'));
    $('backupPill').addEventListener('click', function () {
      var st = Ctl.status();
      if (st.code === 'reconnect') {
        Ctl.reconnect().then(function (r) { if (r.message) toast(r.message, { level: r.ok ? '' : 'error' }); render(); });
      } else if (st.code === 'nokey') {
        openPass();
      } else {
        openSettings();
      }
    });
    $('btnSettings').addEventListener('click', openSettings);
    $('footVersion').textContent = 'Wiedervorlage ' + WV.VERSION + (S.isFile ? ' · lokale Datei' : '');
    initQuick();
    initFilters();
    initEdit();
    $('list').addEventListener('click', onListClick);
    doc.addEventListener('keydown', onKey);
    Ctl.onStatus = function () {
      renderBackupPill();
      renderBanners();
    };
    $('dlgSettings').addEventListener('close', function () { clear($('dlgSettings')); });
    // Datum kann über Nacht wechseln
    setInterval(function () { if (D.today() !== S.today) render(); }, 60000);
    doc.addEventListener('visibilitychange', function () {
      if (doc.visibilityState === 'visible') { if (D.today() !== S.today) render(); }
      else { flushEdit(); Ctl.flush(); }
    });
    root.addEventListener('pagehide', function () { flushEdit(); Ctl.flush(); });
    DB.onRemoteChange = function () {
      WV.ui.loadState().then(function () { return Ctl.refresh(); }).then(render);
    };
    DB.onBlocked = function () { S.stale = true; renderBanners(); };
  };

  WV.ui.focusQuick = function () {
    // Auf Touch-Geräten nicht automatisch fokussieren (Tastatur würde sofort aufklappen)
    var coarse = root.matchMedia && root.matchMedia('(pointer: coarse)').matches;
    if (!coarse) $('qTitle').focus();
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);

/* ---- 90-main.js ---- */
/* Wiedervorlage – Start */
(function (root) {
  'use strict';
  var WV = root.WV, doc = root.document;

  // Rückkehr von Google sofort auswerten und das Token aus der Adresszeile entfernen
  var authReturn = null;
  try { authReturn = WV.auth.handleReturn(); } catch (e) { authReturn = { error: 'state_mismatch' }; }

  async function boot() {
    WV.ui.applyTheme();
    // Einbettung in fremde Seiten verhindern
    if (root.top !== root.self) {
      doc.body.textContent = 'Die Wiedervorlage kann nicht eingebettet verwendet werden.';
      return;
    }
    if (!WV.crypto.available()) {
      WV.state.fatal = 'Dieser Browser stellt keine Verschlüsselungsfunktionen bereit. Sicherungen sind hier nicht möglich.';
    }
    try {
      await WV.db.open();
    } catch (e) {
      WV.state.fatal = 'Der lokale Speicher des Browsers ist nicht verfügbar. Aufgaben können auf diesem Gerät nicht gespeichert werden.';
      WV.ui.init();
      WV.ui.render();
      return;
    }
    await WV.ui.loadState();
    await WV.backupCtl.init();
    await WV.sync.init();
    WV.ui.init();
    WV.ui.initSync();
    WV.ui.render();
    WV.ui.focusQuick();
    WV.db.requestPersist().then(function (p) { WV.state.persisted = p; });
    WV.ui.initSW();
    doc.documentElement.setAttribute('data-ready', '1');
    // Synchronisation bzw. Rückkehr von Google
    WV.ui.handleAuthReturn(authReturn);
    // Ungesicherte Änderungen vom letzten Mal nachholen (ohne Dialog)
    setTimeout(function () { WV.backupCtl.runAuto(); }, 1500);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof globalThis !== 'undefined' ? globalThis : self);
