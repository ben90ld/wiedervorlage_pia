/* Wiedervorlage – Google Drive API v3, nur App-Ordner (appDataFolder)
 * Übertragen werden ausschließlich verschlüsselte Inhalte und technische Dateinamen.
 */
(function (root) {
  'use strict';
  var WV = root.WV, u = WV.util;
  var G = WV.drive = {};
  var API = 'https://www.googleapis.com';
  G.FIELDS = 'id,name,version,createdTime,modifiedTime,size';

  function fail(code, msg, status) { var e = new Error(msg); e.code = code; e.status = status || 0; return e; }

  async function call(token, method, path, body, contentType) {
    var headers = { Authorization: 'Bearer ' + token };
    if (contentType) headers['Content-Type'] = contentType;
    var res;
    try {
      res = await fetch(API + path, { method: method, headers: headers, body: body, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    } catch (e) {
      throw fail('NETWORK', 'Keine Verbindung zu Google Drive.');
    }
    if (res.status === 204) return '';
    var text = await res.text();
    if (!res.ok) {
      if (res.status === 401) throw fail('AUTH', 'Google-Anmeldung abgelaufen.', 401);
      if (res.status === 404) throw fail('NOTFOUND', 'Datei in Google Drive nicht gefunden.', 404);
      if (res.status === 403 || res.status === 429) throw fail('RATE', 'Google Drive lehnt die Anfrage vorübergehend ab.', res.status);
      if (res.status >= 500) throw fail('SERVER', 'Google Drive ist vorübergehend nicht erreichbar.', res.status);
      throw fail('HTTP', 'Google Drive meldet einen Fehler (' + res.status + ').', res.status);
    }
    return text;
  }

  G.list = async function (token) {
    var files = [], pageToken = '';
    do {
      var q = '/drive/v3/files?spaces=appDataFolder&pageSize=100&fields=nextPageToken,files(' + G.FIELDS + ')' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
      var r = JSON.parse(await call(token, 'GET', q));
      files = files.concat(r.files || []);
      pageToken = r.nextPageToken || '';
    } while (pageToken);
    return files;
  };

  G.download = function (token, id) {
    return call(token, 'GET', '/drive/v3/files/' + encodeURIComponent(id) + '?alt=media');
  };

  G.create = async function (token, name, text) {
    var boundary = 'wv' + u.hex(u.randomBytes(8));
    var meta = JSON.stringify({ name: name, parents: ['appDataFolder'] });
    var body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n--' + boundary +
      '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + text + '\r\n--' + boundary + '--';
    return JSON.parse(await call(token, 'POST', '/upload/drive/v3/files?uploadType=multipart&fields=' + G.FIELDS, body, 'multipart/related; boundary=' + boundary));
  };

  G.update = async function (token, id, text) {
    return JSON.parse(await call(token, 'PATCH', '/upload/drive/v3/files/' + encodeURIComponent(id) + '?uploadType=media&fields=' + G.FIELDS, text, 'application/json; charset=UTF-8'));
  };

  G.remove = function (token, id) {
    return call(token, 'DELETE', '/drive/v3/files/' + encodeURIComponent(id));
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
