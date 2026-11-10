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
