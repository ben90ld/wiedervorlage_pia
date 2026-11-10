// Nachbildung von Google-Anmeldung und Drive-App-Ordner für Browser-Tests.
// Ein gemeinsamer Speicher für mehrere Browser-Kontexte (= mehrere Geräte).
function createFakeGoogle() {
  const fake = {
    files: new Map(), tokens: new Set(), seq: 0, tok: 0,
    authRequests: [], apiCalls: [], silentFail: null, offlineApi: false,
    versionStep: 2 // Drive erhöht Versionen nicht zwingend um 1
  };
  const now = () => new Date().toISOString();
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  const meta = (f) => ({ id: f.id, name: f.name, version: String(f.version), createdTime: f.createdTime, modifiedTime: f.modifiedTime, size: String(f.content.length) });

  fake.attach = async (ctx) => {
    await ctx.route('https://accounts.google.com/**', async (route) => {
      const u = new URL(route.request().url());
      const p = u.searchParams;
      fake.authRequests.push({ prompt: p.get('prompt'), scope: p.get('scope'), redirect: p.get('redirect_uri') });
      const back = new URLSearchParams({ state: p.get('state') });
      if (p.get('prompt') === 'none' && fake.silentFail) {
        back.set('error', fake.silentFail);
      } else {
        const token = 'tok-' + (++fake.tok);
        fake.tokens.add(token);
        back.set('access_token', token); back.set('token_type', 'Bearer'); back.set('expires_in', '3599'); back.set('scope', p.get('scope'));
      }
      await route.fulfill({ status: 302, headers: { Location: p.get('redirect_uri') + '#' + back.toString() } });
    });
    await ctx.route('https://www.googleapis.com/**', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const method = req.method();
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (fake.offlineApi) return route.abort('internetdisconnected');
      const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(o) });
      const auth = (req.headers().authorization || '').replace('Bearer ', '');
      fake.apiCalls.push(method + ' ' + url.pathname);
      if (url.pathname === '/drive/v3/about') return json({ error: { code: 401 } }, 401);
      if (!fake.tokens.has(auth)) return json({ error: { code: 401, status: 'UNAUTHENTICATED' } }, 401);
      if (url.pathname === '/drive/v3/files' && method === 'GET') {
        if (url.searchParams.get('spaces') !== 'appDataFolder') return json({ error: { code: 403 } }, 403);
        return json({ files: [...fake.files.values()].map(meta) });
      }
      if (url.pathname === '/upload/drive/v3/files' && method === 'POST') {
        const body = req.postData();
        const parts = body.split(/\r\n--wv[0-9a-f]+/);
        const metaJson = JSON.parse(parts[0].split('\r\n\r\n')[1]);
        const content = parts[1].split('\r\n\r\n').slice(1).join('\r\n\r\n');
        if (!metaJson.parents || metaJson.parents[0] !== 'appDataFolder') return json({ error: { code: 403 } }, 403);
        const f = { id: 'f' + (++fake.seq), name: metaJson.name, content, version: 1, createdTime: now(), modifiedTime: now() };
        fake.files.set(f.id, f);
        return json(meta(f));
      }
      const m = url.pathname.match(/\/files\/([^/]+)$/);
      const f = m && fake.files.get(m[1]);
      if (!f) return json({ error: { code: 404 } }, 404);
      if (method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: f.content });
      if (method === 'PATCH') { f.content = req.postData(); f.version += fake.versionStep; f.modifiedTime = now(); return json(meta(f)); }
      if (method === 'DELETE') { fake.files.delete(f.id); return route.fulfill({ status: 204, headers: cors }); }
      return json({}, 400);
    });
  };
  fake.byName = (re) => [...fake.files.values()].filter((f) => re.test(f.name));
  return fake;
}
module.exports = { createFakeGoogle };
