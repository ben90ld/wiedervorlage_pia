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
