const test = require('node:test');
const assert = require('node:assert/strict');
const WV = require('./load');
const M = WV.model, D = WV.dates;

let counter = 0;
const ctx = (dev = 'pc') => ({ dev, c: ++counter, t: new Date(Date.UTC(2026, 10, 10, 8, 0, counter)).toISOString() });

function task(over) {
  return M.newTask(Object.assign({ title: 'Aufgabe', recall: '2026-11-17' }, over), ctx());
}

test('Automatische Erkennung der Aufgabenart', () => {
  const cases = [
    ['Arztbrief fertigstellen', 'brief'],
    ['Brief an Hausarzt', 'brief'],
    ['Ambulanzbrief diktieren', 'brief'],
    ['Rezept vorbereiten', 'rezept'],
    ['Verordnung ausstellen', 'rezept'],
    ['Labor kontrollieren', 'befund'],
    ['Befund anfordern', 'befund'],
    ['Blutwerte prüfen', 'befund'],
    ['Rückruf durchführen', 'rueckruf'],
    ['Frau anrufen', 'rueckruf'],
    ['telefonieren mit Praxis', 'rueckruf'],
    ['Mail beantworten', 'mail'],
    ['E-Mail an Betreuer', 'mail'],
    ['Kollegin antworten', 'mail'],
    ['Bescheinigung erstellen', 'bescheinigung'],
    ['Attest schreiben', 'bescheinigung'],
    ['Antrag bearbeiten', 'antrag'],
    ['Formular ausfüllen', 'antrag'],
    ['Rentenantrag prüfen', 'antrag'],
    ['Verlaufsdoku nachtragen', 'doku'],
    ['Dokumentation vervollständigen', 'doku'],
    ['RS mit OA wegen Medikation', 'rs'],
    ['Rücksprache Sozialdienst', 'rs'],
    ['Fall im PIA-Team vorstellen', 'piateam'],
    ['Teambesprechung Thema einbringen', 'piateam'],
    ['PIA-Intervision Fall vorbereiten', 'intervision'],
    ['Vorbereitung Gruppentermin', 'vorbereitung'],
    ['Gespräch vorbereiten', 'vorbereitung'],
    ['Versicherung anschreiben', 'sonstiges'],
    ['Termin klären', 'sonstiges'],
    ['', 'sonstiges']
  ];
  for (const [title, type] of cases) assert.equal(M.detectType(title), type, title);
  // Früheste Fundstelle entscheidet
  assert.equal(M.detectType('Rückruf wegen Rezept'), 'rueckruf');
  assert.equal(M.detectType('Rezept nach Rückruf'), 'rezept');
  // Allgemeines "vorbereiten" verdrängt keine spezifische Art
  assert.equal(M.detectType('Rezept vorbereiten'), 'rezept');
  assert.equal(M.detectType('Arztbrief vorbereiten'), 'brief');
  // Kürzel RS nur als ganzes Wort (nicht in "Kurs", "Versicherung")
  assert.equal(M.detectType('Kurs anmelden'), 'sonstiges');
});

test('Einordnung: Wiedervorlage und Frist strikt getrennt', () => {
  const today = '2026-11-10';
  const cls = (recall, deadline) => M.classify(task({ recall, deadline }), today);
  assert.equal(cls('2026-11-10', null).section, 'today');
  assert.equal(cls('2026-11-03', null).section, 'today');
  assert.equal(cls('2026-11-11', null).section, 'week');
  assert.equal(cls('2026-11-17', null).section, 'week');
  assert.equal(cls('2026-11-18', null).section, 'later');
  // Frist innerhalb von 2 Tagen holt eine späte Wiedervorlage nach "Heute"
  assert.equal(cls('2026-12-01', '2026-11-12').section, 'today');
  assert.equal(cls('2026-12-01', '2026-11-11').section, 'today');
  assert.equal(cls('2026-12-01', '2026-11-10').section, 'today');
  assert.equal(cls('2026-12-01', '2026-11-01').section, 'today');
  assert.equal(cls('2026-12-01', '2026-11-13').section, 'later');
  // Farben
  assert.equal(cls('2026-12-01', '2026-11-10').deadlineColor, 'red');
  assert.equal(cls('2026-12-01', '2026-11-09').deadlineColor, 'red');
  assert.equal(cls('2026-12-01', '2026-11-13').deadlineColor, 'yellow');
  assert.equal(cls('2026-12-01', '2026-11-11').deadlineColor, 'yellow');
  assert.equal(cls('2026-12-01', '2026-11-14').deadlineColor, 'neutral');
});

test('Sortierung: nahe Frist vor wichtig ohne Frist, dann wichtig, dann Wiedervorlage', () => {
  const today = '2026-11-10';
  const items = [
    task({ title: 'A wichtig, keine Frist, sehr alt', recall: '2026-10-01', important: true }),
    task({ title: 'B Frist heute', recall: '2026-11-10', deadline: '2026-11-10' }),
    task({ title: 'C Frist morgen, wichtig', recall: '2026-11-10', deadline: '2026-11-11', important: true }),
    task({ title: 'D Frist morgen', recall: '2026-11-09', deadline: '2026-11-11' }),
    task({ title: 'E keine Frist, älter', recall: '2026-11-05' }),
    task({ title: 'F Frist überschritten', recall: '2026-11-10', deadline: '2026-11-05' }),
    task({ title: 'G keine Frist, heute', recall: '2026-11-10' })
  ];
  const view = M.buildView(items, [], {}, { today });
  const order = view.sections.today.concat(view.sections.todayLong).map((i) => i.task.v.title[0]);
  // Stufe 0: F (überschritten, Wiedervorlage 10.11.) und B (heute, 10.11.) → gleiche WV → nach Frist: F vor B
  // Stufe 1: C (wichtig) vor D
  // Stufe 3: A wichtig vor E, G; E (älter) vor G
  assert.deepEqual(order, ['F', 'B', 'C', 'D', 'A', 'E', 'G']);
});

test('Länger überfällige Aufgaben werden eingeklappt, bleiben aber in den Zählern', () => {
  const today = '2026-11-10';
  const items = [
    task({ title: 'alt', recall: '2026-10-20' }),
    task({ title: 'alt wichtig', recall: '2026-10-20', important: true }),
    task({ title: 'alt mit Frist bald', recall: '2026-10-20', deadline: '2026-11-13' }),
    task({ title: 'jüngst', recall: '2026-11-05' })
  ];
  const view = M.buildView(items, [], {}, { today });
  assert.deepEqual(view.sections.todayLong.map((i) => i.task.v.title), ['alt']);
  assert.equal(view.sections.today.length, 3);
  assert.equal(view.counts.overdue, 4);
});

test('Zähler stimmen mit den Bereichen überein', () => {
  const today = '2026-11-10';
  const items = [
    task({ title: 'überfällig WV', recall: '2026-11-08' }),
    task({ title: 'überfällig Frist', recall: '2026-11-20', deadline: '2026-11-09' }),
    task({ title: 'heute WV', recall: '2026-11-10' }),
    task({ title: 'heute Frist', recall: '2026-11-20', deadline: '2026-11-10' }),
    task({ title: 'Frist übermorgen', recall: '2026-11-20', deadline: '2026-11-12' }),
    task({ title: 'Woche', recall: '2026-11-15' }),
    task({ title: 'später', recall: '2026-12-15' })
  ];
  const done = task({ title: 'erledigt', recall: '2026-11-01' });
  const doneRec = M.write(done, { status: 'done', doneAt: '2026-11-09T10:00:00.000Z' }, ctx());
  const view = M.buildView(items.concat([doneRec]), [], {}, { today });
  assert.equal(view.counts.overdue, 2);
  assert.equal(view.counts.dueToday, 2);
  assert.equal(view.counts.open, 7);
  assert.equal(view.counts.done, 1);
  assert.equal(view.sections.today.length, 5);
  assert.deepEqual(view.composition, { overdue: 2, today: 2, soon: 1, conflict: 0 });
  assert.equal(view.sections.week.length, 1);
  assert.equal(view.sections.later.length, 1);
  assert.equal(view.done.length, 1);
  // jede offene Aufgabe genau einem Bereich zugeordnet
  const total = view.sections.today.length + view.sections.todayLong.length + view.sections.week.length + view.sections.later.length;
  assert.equal(total, view.counts.open);
});

test('Suche über Titel, Patient und lokale Notiz; Filter', () => {
  const today = '2026-11-10';
  const p = M.newPatient('Musterfrau, E.', ctx());
  const a = task({ title: 'Labor kontrollieren', patientId: p.id, type: 'befund' });
  const b = task({ title: 'Rezept vorbereiten', type: 'rezept', important: true });
  const local = { [b.id]: { id: b.id, note: 'Praxis Sonnenschein anfragen' } };
  const q = (search, extra) => M.buildView([a, b], [p], local, Object.assign({ today, search }, extra));
  const all = (v) => [].concat(v.sections.today, v.sections.todayLong, v.sections.week, v.sections.later).map((i) => i.task.id);
  assert.deepEqual(all(q('musterfrau')), [a.id]);
  assert.deepEqual(all(q('sonnenschein')), [b.id]);
  assert.deepEqual(all(q('labor')), [a.id]);
  assert.deepEqual(all(q('', { fType: 'rezept' })), [b.id]);
  assert.deepEqual(all(q('', { fImportant: true })), [b.id]);
});

test('Patientenkürzel normalisieren und Hinweise', () => {
  assert.deepEqual(M.normalizePatient('Müller, M.'), { label: 'Müller, M.', warn: null });
  assert.equal(M.normalizePatient('müller m').label, 'Müller, M.');
  assert.equal(M.normalizePatient('Müller, Maria').label, 'Müller, M.');
  assert.ok(M.normalizePatient('Müller, Maria').warn);
  assert.equal(M.normalizePatient('von der Heide, A').label, 'von der Heide, A.');
  assert.equal(M.normalizePatient('müller-lüdenscheidt h.').label, 'Müller-Lüdenscheidt, H.');
  assert.ok(M.normalizePatient('Müller 12.03.1980').warn);
});

test('Gleiches Kürzel: keine stille Zuordnung bei Teiltreffer, Unterscheidung bei Doppelung', () => {
  const p1 = M.newPatient('Müller, M.', ctx());
  const p2 = M.newPatient('Müller, M.', ctx());
  const p3 = M.newPatient('Schmidt, A.', ctx());
  const t1 = task({ title: 'Arztbrief', patientId: p1.id });
  const t2 = task({ title: 'Rückruf', patientId: p2.id });
  const t3 = task({ title: 'Rezept', patientId: p3.id });
  const display = M.patientDisplayMap([p1, p2, p3]);
  assert.equal(display[p1.id], 'Müller, M.');
  assert.equal(display[p2.id], 'Müller, M. (2)');
  const exact = M.patientSuggestions('Müller, M.', [p1, p2, p3], [t1, t2, t3], display);
  assert.equal(exact.items[exact.defaultIndex].kind, 'existing');
  assert.equal(exact.items.filter((i) => i.kind === 'existing').length, 2);
  assert.equal(exact.items[exact.items.length - 1].kind, 'new');
  assert.equal(exact.items[exact.items.length - 1].sameLabel, true);
  const partial = M.patientSuggestions('Mül', [p1, p2, p3], [t1, t2, t3], display);
  assert.equal(partial.items[partial.defaultIndex].kind, 'new');
  assert.ok(partial.items.some((i) => i.kind === 'existing'));
});

test('Schreiben stempelt nur geänderte Felder', () => {
  const t = task({ title: 'X' });
  const dotBefore = t.m.title;
  const t2 = M.write(t, { title: 'X', important: true }, ctx());
  assert.deepEqual(t2.m.title, dotBefore);
  assert.notDeepEqual(t2.m.important, t.m.important);
});

test('Verschiebungszähler', () => {
  let t = task({});
  t = M.bumpPostpone(t, ctx('pc'), 1);
  t = M.bumpPostpone(t, ctx('pc'), 1);
  t = M.bumpPostpone(t, ctx('ip'), 1);
  assert.equal(M.postponeCount(t), 3);
  t = M.bumpPostpone(t, ctx('pc'), -1);
  assert.equal(M.postponeCount(t), 2);
});

test('Wiedervorlage unbekannt: eigener Bereich, nahe Frist holt nach "Heute", in Zählern enthalten', () => {
  const today = '2026-11-10';
  const a = task({ title: 'ohne Datum', recall: null });
  const b = task({ title: 'ohne Datum, Frist morgen', recall: null, deadline: '2026-11-11' });
  const c = task({ title: 'ohne Datum, wichtig', recall: null, important: true });
  assert.equal(M.classify(a, today).section, 'nodate');
  assert.equal(M.classify(a, today).overdue, false);
  assert.equal(M.classify(b, today).section, 'today');
  const v = M.buildView([a, b, c], [], {}, { today });
  assert.deepEqual(v.sections.nodate.map((i) => i.task.v.title), ['ohne Datum, wichtig', 'ohne Datum']);
  assert.equal(v.counts.open, 3);
  assert.equal(v.counts.overdue, 0);
});

test('Doku ist die erste Aufgabenart', () => {
  assert.equal(M.TYPES[0].id, 'doku');
  assert.equal(M.TYPES[M.TYPES.length - 1].id, 'sonstiges');
  assert.equal(M.TYPES.length, 13);
});
