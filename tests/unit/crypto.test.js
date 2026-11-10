const test = require('node:test');
const assert = require('node:assert/strict');
const WV = require('./load');
const C = WV.crypto, F = WV.format, M = WV.model;

const PASS = 'Wolke Fahrrad Kompass Tinte Ahorn';

test('Schlüssel erzeugen, mit Passphrase entsperren, falsche Passphrase erkennen', async () => {
  const k = await C.createKey(PASS);
  assert.equal(k.info.kdf.iterations, 600000);
  assert.equal(C.unb64(k.info.kdf.salt).length, 16);
  assert.equal(k.key.extractable, false);
  const key = await C.unlock(k.info, PASS);
  assert.equal(key.extractable, false);
  await assert.rejects(C.unlock(k.info, PASS + 'x'), (e) => e.code === 'WRONG_PASSPHRASE');
});

test('Sicherung: verschlüsseln, prüfen, entschlüsseln; kein Klartext in der Datei', async () => {
  const k = await C.createKey(PASS);
  const ctx = { dev: 'pc', c: 1, t: '2026-11-10T08:00:00.000Z' };
  const p = M.newPatient('Musterfrau, E.', ctx);
  const t = M.newTask({ title: 'Arztbrief fertigstellen', recall: '2026-11-17', patientId: p.id }, ctx);
  const payload = { schema: 1, exportedAt: ctx.t, sourceDevice: 'pc', tasks: [t], patients: [p], local: [{ id: t.id, note: 'Vorbefunde anfordern', lu: ctx.t }] };
  const out = await F.encode(payload, k.key, k.info);
  assert.ok(!out.text.includes('Musterfrau'));
  assert.ok(!out.text.includes('Arztbrief'));
  assert.ok(!out.text.includes('Vorbefunde'));
  const header = F.parse(out.text);
  // Wiederherstellung nur mit Datei + Passphrase (z. B. nach gelöschtem Browserprofil)
  const key2 = await C.unlock(header.key, PASS);
  const dec = await F.decrypt(header, key2);
  assert.equal(dec.hash, out.hash);
  assert.equal(dec.payload.tasks[0].v.title, 'Arztbrief fertigstellen');
  assert.equal(dec.payload.patients[0].v.label, 'Musterfrau, E.');
  assert.equal(dec.payload.local[0].note, 'Vorbefunde anfordern');
});

test('Veränderte Datei wird erkannt (Authentifizierung)', async () => {
  const k = await C.createKey(PASS);
  const out = await F.encode({ schema: 1, tasks: [], patients: [], local: [] }, k.key, k.info);
  const h = JSON.parse(out.text);
  // Metadaten verändern → Zusatzdaten passen nicht mehr
  h.createdAt = '2020-01-01T00:00:00.000Z';
  await assert.rejects(F.decrypt(F.parse(JSON.stringify(h)), k.key), (e) => e.code === 'DECRYPT');
  // Inhalt verändern
  const h2 = JSON.parse(out.text);
  const bytes = C.unb64(h2.payload.data); bytes[5] ^= 1; h2.payload.data = C.b64(bytes);
  await assert.rejects(F.decrypt(F.parse(JSON.stringify(h2)), k.key), (e) => e.code === 'DECRYPT');
});

test('Jede Verschlüsselung verwendet einen neuen IV', async () => {
  const k = await C.createKey(PASS);
  const ivs = new Set();
  for (let i = 0; i < 50; i++) ivs.add((await C.seal(k.key, C.encodeText('x'), 'a')).iv);
  assert.equal(ivs.size, 50);
});

test('Ungültige oder neuere Formate werden mit verständlicher Meldung abgewiesen', async () => {
  assert.throws(() => F.parse('kein json'), (e) => e.code === 'FORMAT');
  assert.throws(() => F.parse(JSON.stringify({ format: 'anderes' })), (e) => e.code === 'FORMAT');
  const k = await C.createKey(PASS);
  const out = await F.encode({ schema: 1, tasks: [], patients: [], local: [] }, k.key, k.info);
  const h = JSON.parse(out.text); h.formatVersion = 99;
  assert.throws(() => F.parse(JSON.stringify(h)), (e) => e.code === 'NEWER');
  // Manipulierte, extrem hohe Iterationszahl wird nicht ausgeführt
  const h2 = JSON.parse(out.text); h2.key.kdf.iterations = 1e9;
  assert.throws(() => F.parse(JSON.stringify(h2)), (e) => e.code === 'FORMAT');
});

test('Migrationspfad für ältere Datenschemata', () => {
  // Künstliches Vorläuferschema 0 (Aufgaben ohne "typeAuto") – prüft den Mechanismus
  F.migrations[0] = (p) => {
    p.tasks.forEach((t) => { t.v.typeAuto = false; t.m.typeAuto = t.m.title; });
    p.schema = 1;
    return p;
  };
  const ctx = { dev: 'alt', c: 1, t: '2025-01-01T00:00:00.000Z' };
  const t = M.newTask({ title: 'Alt', recall: '2025-01-10' }, ctx);
  delete t.v.typeAuto; delete t.m.typeAuto;
  const out = F.migrate({ schema: 0, tasks: [t], patients: [], local: [] });
  assert.equal(out.tasks[0].v.typeAuto, false);
  delete F.migrations[0];
  assert.throws(() => F.migrate({ schema: 0, tasks: [] }), (e) => e.code === 'FORMAT');
  assert.throws(() => F.migrate({ schema: 2, tasks: [] }), (e) => e.code === 'NEWER');
});

test('Fehlerhafte Einträge werden übersprungen und gezählt', () => {
  const ctx = { dev: 'pc', c: 1, t: '2026-11-10T08:00:00.000Z' };
  const good = M.newTask({ title: 'Gut', recall: '2026-11-17' }, ctx);
  const bad1 = { id: 'x', v: { title: 'ohne Metadaten' } };
  const bad2 = Object.assign({}, good, { id: 'y', v: Object.assign({}, good.v, { recall: '2026-02-30' }) });
  const out = F.sanitize({ schema: 1, tasks: [good, bad1, bad2], patients: [{ id: 'p' }], local: [{ id: 1 }] });
  assert.equal(out.tasks.length, 1);
  assert.equal(out.skipped, 4);
});
