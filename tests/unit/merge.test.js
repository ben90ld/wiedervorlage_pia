const test = require('node:test');
const assert = require('node:assert/strict');
const WV = require('./load');
const M = WV.model, X = WV.merge, u = WV.util;

// Simuliert Geräte mit eigenem Zähler und eigener Uhr
function device(name, startMinute) {
  let c = 0, minute = startMinute || 0;
  return {
    name,
    ctx() { c++; minute++; return { dev: name, c, t: new Date(Date.UTC(2026, 10, 10, 8, minute)).toISOString() }; }
  };
}
const merge = (L, R) => X.mergeRecord(L, R, M.TASK_FIELDS, true);
const values = (r) => JSON.stringify(Object.keys(r.v).sort().map((k) => [k, r.v[k]]));

function setup() {
  const pc = device('pc', 0), ip = device('ip', 100);
  const base = M.newTask({ title: 'Arztbrief fertigstellen', recall: '2026-11-17' }, pc.ctx());
  return { pc, ip, base, pcCopy: u.clone(base), ipCopy: u.clone(base) };
}

test('Nacheinander: neuere Änderung wird ohne Konflikt übernommen', () => {
  const { ip, base } = setup();
  const ipEdit = M.write(base, { title: 'Arztbrief fertigstellen und senden' }, ip.ctx());
  const r = merge(base, ipEdit);
  assert.equal(r.rec.v.title, 'Arztbrief fertigstellen und senden');
  assert.equal(r.newConflicts, 0);
  assert.equal(M.openConflicts(r.rec).length, 0);
});

test('Ältere Fassung (z. B. alte Sicherung) überschreibt neuere Daten nicht', () => {
  const { pc, base } = setup();
  const newer = M.write(base, { title: 'Neu', recall: '2026-11-24' }, pc.ctx());
  const r = merge(newer, base);
  assert.equal(r.valueChanged, false);
  assert.equal(r.rec.v.title, 'Neu');
  assert.equal(r.rec.v.recall, '2026-11-24');
});

test('PC verschiebt, iPhone ändert Patient → automatisch zusammengeführt', () => {
  const { pc, ip, pcCopy, ipCopy } = setup();
  let a = M.write(pcCopy, { recall: '2026-11-24' }, pc.ctx());
  a = M.bumpPostpone(a, pc.ctx(), 1);
  const b = M.write(ipCopy, { patientId: 'p-1' }, ip.ctx());
  const r1 = merge(a, b), r2 = merge(b, a);
  assert.equal(r1.rec.v.recall, '2026-11-24');
  assert.equal(r1.rec.v.patientId, 'p-1');
  assert.equal(M.openConflicts(r1.rec).length, 0);
  assert.equal(values(r1.rec), values(r2.rec));
});

test('Beide ändern den Titel unterschiedlich → Konflikt, beide Fassungen erhalten, kommutativ', () => {
  const { pc, ip, pcCopy, ipCopy } = setup();
  const a = M.write(pcCopy, { title: 'Titel PC' }, pc.ctx());
  const b = M.write(ipCopy, { title: 'Titel iPhone' }, ip.ctx()); // spätere Uhrzeit → vorläufiger Gewinner
  const r1 = merge(a, b), r2 = merge(b, a);
  assert.equal(r1.rec.v.title, 'Titel iPhone');
  assert.equal(r2.rec.v.title, 'Titel iPhone');
  const c1 = M.openConflicts(r1.rec), c2 = M.openConflicts(r2.rec);
  assert.equal(c1.length, 1);
  assert.equal(c1[0].o, 'Titel PC');
  assert.equal(c1[0].id, c2[0].id);
  assert.equal(r1.newConflicts, 1);
  // Konflikt erzwingt Sichtbarkeit unter "Heute & überfällig"
  assert.equal(M.classify(r1.rec, '2026-11-10').section, 'today');
});

test('Gleicher Wert auf beiden Seiten → kein Konflikt', () => {
  const { pc, ip, pcCopy, ipCopy } = setup();
  const a = M.write(pcCopy, { important: true }, pc.ctx());
  const b = M.write(ipCopy, { important: true }, ip.ctx());
  const r = merge(a, b);
  assert.equal(M.openConflicts(r.rec).length, 0);
  assert.equal(r.rec.v.important, true);
});

test('iPhone erledigt, PC bearbeitet offline → Konflikt, Aufgabe bleibt sichtbar', () => {
  const { pc, ip, pcCopy, ipCopy } = setup();
  const a = M.write(pcCopy, { title: 'Arztbrief fertigstellen (Vorbefunde da)' }, pc.ctx());
  const b = M.write(ipCopy, { status: 'done', doneAt: '2026-11-10T09:00:00.000Z' }, ip.ctx());
  const r1 = merge(a, b), r2 = merge(b, a);
  for (const r of [r1, r2]) {
    assert.equal(r.rec.v.status, 'done');
    assert.equal(r.rec.v.title, 'Arztbrief fertigstellen (Vorbefunde da)');
    const c = M.openConflicts(r.rec);
    assert.equal(c.length, 1);
    assert.equal(c[0].k, 'done');
    assert.equal(M.isVisibleOpen(r.rec), true);
  }
  assert.equal(values(r1.rec), values(r2.rec));
});

test('Erledigen auf einem, Verschieben auf dem anderen Gerät → Konflikt, Frist unverändert', () => {
  const { pc, ip, pcCopy, ipCopy } = setup();
  pcCopy.v.deadline = '2026-11-20'; ipCopy.v.deadline = '2026-11-20';
  let a = M.write(pcCopy, { recall: '2026-11-24' }, pc.ctx());
  a = M.bumpPostpone(a, pc.ctx(), 1);
  const b = M.write(ipCopy, { status: 'done', doneAt: '2026-11-10T09:00:00.000Z' }, ip.ctx());
  const r = merge(a, b);
  assert.equal(M.openConflicts(r.rec)[0].k, 'done');
  assert.equal(r.rec.v.deadline, '2026-11-20');
  assert.equal(M.postponeCount(r.rec), 1);
});

test('Gelöscht auf einem, bearbeitet auf dem anderen Gerät → Konflikt, sichtbar', () => {
  const { pc, ip, pcCopy, ipCopy } = setup();
  const a = M.write(pcCopy, { deleted: true }, pc.ctx());
  const b = M.write(ipCopy, { deadline: '2026-11-12' }, ip.ctx());
  const r = merge(b, a);
  assert.equal(r.rec.v.deleted, true);
  assert.equal(M.openConflicts(r.rec)[0].k, 'delete');
  assert.equal(M.isVisibleOpen(r.rec), true);
});

test('Gelöscht ohne gleichzeitige Bearbeitung → kein Konflikt, bleibt gelöscht (Löschmarker)', () => {
  const { pc, base } = setup();
  const del = M.write(base, { deleted: true }, pc.ctx());
  const r = merge(base, del);
  assert.equal(r.rec.v.deleted, true);
  assert.equal(M.openConflicts(r.rec).length, 0);
  assert.equal(M.isVisibleOpen(r.rec), false);
  // Wiederholte Synchronisation mit altem Stand lässt die Aufgabe nicht wieder auftauchen
  assert.equal(merge(r.rec, base).rec.v.deleted, true);
});

test('Beide erledigen → kein Konflikt', () => {
  const { pc, ip, pcCopy, ipCopy } = setup();
  const a = M.write(pcCopy, { status: 'done', doneAt: '2026-11-10T09:00:00.000Z' }, pc.ctx());
  const b = M.write(ipCopy, { status: 'done', doneAt: '2026-11-10T09:05:00.000Z' }, ip.ctx());
  const r = merge(a, b);
  assert.equal(r.rec.v.status, 'done');
  assert.equal(M.openConflicts(r.rec).length, 0);
});

test('Idempotent: erneutes Zusammenführen ändert nichts', () => {
  const { pc, ip, pcCopy, ipCopy } = setup();
  const a = M.write(pcCopy, { title: 'A' }, pc.ctx());
  const b = M.write(ipCopy, { title: 'B', status: 'done' }, ip.ctx());
  const r1 = merge(a, b);
  const r2 = merge(r1.rec, b);
  const r3 = merge(r1.rec, a);
  assert.equal(r2.changed, false);
  assert.equal(r3.changed, false);
  assert.equal(JSON.stringify(r1.rec), JSON.stringify(r2.rec));
});

test('Konfliktauflösung wird übertragen', () => {
  const { pc, ip, pcCopy, ipCopy } = setup();
  const a = M.write(pcCopy, { title: 'Titel PC' }, pc.ctx());
  const b = M.write(ipCopy, { title: 'Titel iPhone' }, ip.ctx());
  const onPc = merge(a, b).rec;
  const onIp = merge(b, a).rec;
  // Auflösung am PC: PC-Fassung übernehmen
  const cid = M.openConflicts(onPc)[0].id;
  let resolved = M.write(onPc, { title: 'Titel PC' }, pc.ctx());
  resolved.cf[cid].r = true;
  const r = merge(onIp, resolved);
  assert.equal(r.rec.v.title, 'Titel PC');
  assert.equal(M.openConflicts(r.rec).length, 0);
});

test('Verschiebungen beider Geräte werden addiert', () => {
  const { pc, ip, pcCopy, ipCopy } = setup();
  let a = M.bumpPostpone(M.write(pcCopy, { recall: '2026-11-24' }, pc.ctx()), pc.ctx(), 1);
  a = M.bumpPostpone(a, pc.ctx(), 1);
  const b = M.bumpPostpone(M.write(ipCopy, { recall: '2026-11-18' }, ip.ctx()), ip.ctx(), 1);
  const r = merge(a, b);
  assert.equal(M.postponeCount(r.rec), 3);
});

test('Drei Geräte, transitive Weitergabe ohne Scheinkonflikt', () => {
  const pc = device('pc', 0), ip = device('ip', 50), n = device('neu', 200);
  const base = M.newTask({ title: 'T', recall: '2026-11-17' }, pc.ctx());
  const ipEdit = M.write(u.clone(base), { title: 'T2' }, ip.ctx());
  const onNew = merge(u.clone(base), ipEdit).rec;          // neues Gerät kennt iPhone-Änderung
  const newEdit = M.write(onNew, { title: 'T3' }, n.ctx());
  const r = merge(merge(u.clone(base), ipEdit).rec, newEdit); // PC erhält beide Stände
  assert.equal(r.rec.v.title, 'T3');
  assert.equal(M.openConflicts(r.rec).length, 0);
});

test('mergeSets: Statistik für die Importvorschau, lokale Notizen nach Zeitstempel', () => {
  const pc = device('pc', 0), ip = device('ip', 100);
  const t1 = M.newTask({ title: 'Eins', recall: '2026-11-17' }, pc.ctx());
  const t2 = M.newTask({ title: 'Zwei', recall: '2026-11-17' }, pc.ctx());
  const local = { tasks: new Map([[t1.id, t1]]), patients: new Map(), local: new Map([[t1.id, { id: t1.id, note: 'alt', lu: '2026-11-01T00:00:00Z' }]]) };
  const t1b = M.write(t1, { title: 'Eins geändert' }, ip.ctx());
  const remote = { tasks: [t1b, t2], patients: [], local: [{ id: t1.id, note: 'neu', lu: '2026-11-05T00:00:00Z' }] };
  const res = X.mergeSets(local, remote, true);
  assert.equal(res.stats.tasksNew, 1);
  assert.equal(res.stats.tasksUpdated, 1);
  assert.equal(res.stats.notesUpdated, 1);
  assert.deepEqual(res.samples.added, ['Zwei']);
  assert.equal(res.local[0].note, 'neu');
  const res2 = X.mergeSets(local, remote, false);
  assert.equal(res2.local.length, 0);
});
