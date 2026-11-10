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
    isFile: root.location.protocol === 'file:', fatal: null, stale: false
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
  var E = { id: null, origRecall: null, postponeCounted: false, type: null, typeAuto: false, important: false, status: 'open', picker: null, saveTimer: null, saving: Promise.resolve() };
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

  function fillEdit(t) {
    $('eTitle').value = t.v.title;
    E.picker.set(t.v.patientId);
    E.type = t.v.type; E.typeAuto = !!t.v.typeAuto;
    paintTypeChips($('eTypes'), E.type, false);
    $('eRecall').value = t.v.recall || '';
    $('eDeadline').value = t.v.deadline || '';
    E.important = !!t.v.important;
    paintToggle($('eImportant'), E.important, 'Wichtig');
    E.status = t.v.status === 'done' ? 'done' : 'open';
    paintSeg($('eStatus'), E.status);
    var loc = S.local.get(t.id);
    $('eNote').value = loc && loc.note ? loc.note : '';
    renderEditConflicts(t);
    var pc = M.postponeCount(t);
    $('eMeta').textContent = 'Erstellt ' + D.fmtDateTime(t.v.createdAt) + ' · Geändert ' + D.fmtDateTime(t.u) +
      (pc ? ' · ' + pc + '× verschoben' : '') + (t.v.typeAuto ? ' · Art automatisch erkannt' : '');
  }

  function openEdit(id) {
    var t = S.tasks.get(id);
    if (!t) return;
    E.id = id; E.origRecall = t.v.recall; E.postponeCounted = false;
    E.picker.reset();
    fillEdit(t);
    setSaveState('');
    var dlg = $('dlgEdit');
    if (!dlg.open) dlg.showModal();
    $('eTitle').focus();
  }
  WV.ui.openEdit = openEdit;

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
    var title = $('eTitle').value.trim();
    if (!title) { setSaveState('Titel darf nicht leer sein – nicht gespeichert.', 'error'); return; }
    if (title !== t.v.title) ch.title = title;
    var ptxt = $('ePatient').value.trim();
    if (!ptxt) { if (t.v.patientId) ch.patient = null; }
    else {
      var sel = E.picker.selected || E.picker.resolve();
      if (sel && sel.id && sel.id !== t.v.patientId) ch.patient = { id: sel.id };
      else if (sel && sel.newLabel) ch.patient = { newLabel: sel.newLabel };
    }
    if (E.type !== t.v.type) { ch.type = E.type; ch.typeAuto = false; }
    var rv = $('eRecall').value || null;
    var countPostpone = false;
    if (rv !== (t.v.recall || null)) {
      if (rv !== null && !saneDate(rv)) { setSaveState('Wiedervorlage: bitte ein gültiges Datum eingeben.', 'error'); return; }
      ch.recall = rv;
      if (rv && !E.postponeCounted && E.origRecall && D.diff(rv, E.origRecall) > 0) { countPostpone = true; E.postponeCounted = true; }
    }
    var dv = $('eDeadline').value;
    if ((dv || null) !== (t.v.deadline || null)) {
      if (dv && !saneDate(dv)) { setSaveState('Frist: bitte ein gültiges Datum eingeben.', 'error'); return; }
      ch.deadline = dv || null;
    }
    if (E.important !== !!t.v.important) ch.important = E.important;
    var curStatus = t.v.status === 'done' ? 'done' : 'open';
    if (E.status !== curStatus) ch.status = E.status;
    var loc = S.local.get(id);
    var note = $('eNote').value;
    var noteChanged = (note || '') !== ((loc && loc.note) || '');
    if (!Object.keys(ch).length && !noteChanged) { setSaveState('Gespeichert', 'ok'); return; }
    setSaveState('Speichert …');
    try {
      if (Object.keys(ch).length) {
        var out = await A.update(id, ch, { countPostpone: countPostpone });
        if (ch.patient && ch.patient.newLabel && out.newPatientId) E.picker.selected = { id: out.newPatientId };
      }
      if (noteChanged) await A.setLocal(id, { note: note || null });
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
      onChange: function () { scheduleEditSave(0); }
    });
    buildTypeChips($('eTypes'), function (id) { E.type = id; paintTypeChips($('eTypes'), E.type, false); scheduleEditSave(0); });
    buildSeg($('eRecallPicks'), [['d', '+1 Tag'], ['w', '+1 Woche'], ['m', '+1 Monat']], function (unit) {
      var t = S.tasks.get(E.id);
      var base = $('eRecall').value && D.isValid($('eRecall').value) ? $('eRecall').value : (t ? t.v.recall : D.today());
      $('eRecall').value = D.postpone(base, D.today(), unit);
      scheduleEditSave(0);
    }, 'small');
    buildSeg($('eStatus'), STATUS_OPTS, function (v) { E.status = v; paintSeg($('eStatus'), v); scheduleEditSave(0); });
    $('eImportant').addEventListener('click', function () { E.important = !E.important; paintToggle($('eImportant'), E.important, 'Wichtig'); scheduleEditSave(0); });
    $('eTitle').addEventListener('input', function () { scheduleEditSave(); });
    $('eTitle').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); flushEdit().then(closeEdit); } });
    $('eRecall').addEventListener('change', function () { scheduleEditSave(600); });
    $('eRecallClear').appendChild(icon('x'));
    $('eRecallClear').addEventListener('click', function () { $('eRecall').value = ''; scheduleEditSave(0); });
    $('eDeadline').addEventListener('change', function () { scheduleEditSave(600); });
    $('eDeadlineClear').appendChild(icon('x'));
    $('eDeadlineClear').addEventListener('click', function () { $('eDeadline').value = ''; scheduleEditSave(0); });
    $('eNote').addEventListener('input', function () { scheduleEditSave(700); });
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

    var body = [
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
        kv('Version', WV.VERSION + ' (Etappe 2: lokal, ohne Google-Synchronisation)'),
        S.isFile ? null : h('p', null, [h('a', { href: 'verbindungstest.html', class: 'btn small' }, 'Verbindungstest Google Drive')]),
        h('p', { class: 'muted' }, 'Organisatorische Wiedervorlage nicht dringender Aufgaben. Kein Patientenaktensystem, kein Befundarchiv, keine Alarmierung, keine medizinische Entscheidungsunterstützung. Patientenbezug nur als „Nachname, Initiale“.')
      ])
    ];
    dialogShell(dlg, 'sHead', 'Einstellungen und Sicherung', body);
  }

  // ---------- Passphrase ----------
  function openPass() {
    var dlg = $('dlgPass');
    var existing = !!Ctl.key;
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
        dlg.close();
        toast(r && r.message ? r.message : 'Passphrase festgelegt. Sicherungen werden jetzt verschlüsselt.', { level: r && r.ok === false ? 'error' : '', timeout: 5000 });
        render();
        if ($('dlgSettings').open) renderSettings();
      } catch (e) {
        err.textContent = 'Der Schlüssel konnte nicht erzeugt werden.';
        okBtn.disabled = false; okBtn.textContent = 'Festlegen';
      }
    }
    okBtn.addEventListener('click', submit);
    [p1, p2].forEach(function (el) { el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } }); });
    dialogShell(dlg, 'pHead', existing ? 'Neue Passphrase festlegen' : 'Passphrase für die Sicherung', [
      h('p', null, 'Sicherungsdateien werden mit dieser Passphrase verschlüsselt. Die Passphrase selbst wird nirgends gespeichert.'),
      existing ? h('p', { class: 'muted' }, 'Bereits vorhandene Sicherungsdateien lassen sich weiterhin nur mit der bisherigen Passphrase öffnen.') : null,
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
