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
