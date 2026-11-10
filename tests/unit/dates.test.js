const test = require('node:test');
const assert = require('node:assert/strict');
const WV = require('./load');
const D = WV.dates;

test('Monatswechsel, Jahreswechsel, Schaltjahr', () => {
  assert.equal(D.addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(D.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(D.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(D.addDays('2027-02-28', 1), '2027-03-01');
  assert.equal(D.addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(D.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(D.addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(D.addMonths('2026-12-15', 1), '2027-01-15');
  assert.equal(D.addMonths('2026-03-31', -1), '2026-02-28');
  assert.equal(D.diff('2027-01-01', '2026-12-31'), 1);
  assert.equal(D.diff('2028-03-01', '2028-02-28'), 2);
});

test('Zeitumstellung beeinflusst Tagesdifferenzen nicht', () => {
  // Europa: 29.03.2026 (Sommerzeit), 25.10.2026 (Winterzeit)
  assert.equal(D.diff('2026-03-30', '2026-03-28'), 2);
  assert.equal(D.diff('2026-10-26', '2026-10-24'), 2);
  assert.equal(D.addDays('2026-03-28', 7), '2026-04-04');
  assert.equal(D.addDays('2026-10-24', 7), '2026-10-31');
});

test('"Heute" folgt der lokalen Zeit (TZ=Europe/Berlin)', () => {
  // Der Testlauf setzt TZ nicht zwingend; geprüft wird das lokale Datum eines festen Zeitpunkts
  const t = new Date(2026, 9, 25, 2, 30); // 25.10.2026 02:30 lokal (Umstellungsnacht)
  D.setNow(() => t);
  assert.equal(D.today(), '2026-10-25');
  const t2 = new Date(2026, 11, 31, 23, 59);
  D.setNow(() => t2);
  assert.equal(D.today(), '2026-12-31');
  D.setNow(null);
});

test('Verschieben ab dem späteren Zeitpunkt, Beispiel aus der Anforderung', () => {
  // Heute 10.11., Aufgabe steht auf 15.11., +1 Woche → 22.11.
  assert.equal(D.postpone('2026-11-15', '2026-11-10', 'w'), '2026-11-22');
  // Wiedervorlage in der Vergangenheit → ab heute
  assert.equal(D.postpone('2026-11-01', '2026-11-10', 'w'), '2026-11-17');
  assert.equal(D.postpone('2026-11-01', '2026-11-10', 'd'), '2026-11-11');
  assert.equal(D.postpone('2026-11-10', '2026-11-10', 'd'), '2026-11-11');
  assert.equal(D.postpone('2026-12-20', '2026-11-10', 'm'), '2027-01-20');
  assert.equal(D.postpone('2026-01-31', '2026-01-20', 'm'), '2026-02-28');
});

test('Gültigkeitsprüfung von Datumsangaben', () => {
  assert.equal(D.isValid('2026-02-29'), false);
  assert.equal(D.isValid('2028-02-29'), true);
  assert.equal(D.isValid('2026-13-01'), false);
  assert.equal(D.isValid('26-11-01'), false);
  assert.equal(D.isValid(null), false);
});

test('Anzeige relativ zu heute', () => {
  const today = '2026-11-10';
  assert.equal(D.relRecall('2026-11-07', today), 'Seit 3 Tagen');
  assert.equal(D.relRecall('2026-11-09', today), 'Seit 1 Tag');
  assert.equal(D.relRecall('2026-11-10', today), 'Heute');
  assert.equal(D.relRecall('2026-11-11', today), 'Morgen');
  assert.equal(D.relRecall('2026-11-14', today), 'Sa 14.11.');
  assert.equal(D.relRecall('2027-01-05', today), 'Di 05.01.2027');
  assert.equal(D.relDeadline('2026-11-10', today), 'Frist heute');
  assert.equal(D.relDeadline('2026-11-11', today), 'Frist morgen');
  assert.equal(D.relDeadline('2026-11-08', today), 'Frist überschritten (08.11.)');
});

test('Schnellwahl: Ende der Woche, 1–4 Wochen, unbekannt', () => {
  // 10.11.2026 = Dienstag
  assert.equal(D.pick('2026-11-10', 'eow'), '2026-11-13');
  assert.equal(D.pick('2026-11-13', 'eow'), '2026-11-13'); // Freitag → heute
  assert.equal(D.pick('2026-11-14', 'eow'), '2026-11-20'); // Samstag → kommender Freitag
  assert.equal(D.pick('2026-11-15', 'eow'), '2026-11-20'); // Sonntag → kommender Freitag
  assert.equal(D.pick('2026-12-28', 'eow'), '2027-01-01'); // über den Jahreswechsel
  assert.equal(D.pick('2026-11-10', '1w'), '2026-11-17');
  assert.equal(D.pick('2026-11-10', '2w'), '2026-11-24');
  assert.equal(D.pick('2026-11-10', '3w'), '2026-12-01');
  assert.equal(D.pick('2026-11-10', '4w'), '2026-12-08');
  assert.equal(D.pick('2026-11-10', 'none'), null);
  assert.equal(D.relRecall(null, '2026-11-10'), 'Datum unbekannt');
  // Verschieben einer Aufgabe ohne Datum: ab heute
  assert.equal(D.postpone(null, '2026-11-10', 'w'), '2026-11-17');
});
