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
