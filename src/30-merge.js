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
