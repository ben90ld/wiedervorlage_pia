// Baut app/app.js, app/sw.js und die Einzeldatei dist/Wiedervorlage_lokal.html
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;

const srcDir = path.join(root, 'src');
const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort();
let js = `/*! Wiedervorlage ${version} – erzeugt aus src/ (${files.join(', ')}) */\n`;
for (const f of files) js += `\n/* ---- ${f} ---- */\n` + fs.readFileSync(path.join(srcDir, f), 'utf8');

const m = js.match(/WV\.VERSION = '([^']+)'/);
if (!m || m[1] !== version) throw new Error(`Versionskonflikt: package.json ${version} / src ${m && m[1]}`);
if (/<\/script|<!--/i.test(js)) throw new Error('app.js enthält Zeichenfolgen, die beim Einbetten stören');

fs.writeFileSync(path.join(root, 'app', 'app.js'), js);
const sw = fs.readFileSync(path.join(root, 'app', 'sw.template.js'), 'utf8').replace('__VERSION__', version);
fs.writeFileSync(path.join(root, 'app', 'sw.js'), sw);

// Einzeldatei für die Nutzung als lokale Datei (file://), ohne Service Worker und ohne Synchronisation
const css = fs.readFileSync(path.join(root, 'app', 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'app', 'index.html'), 'utf8');
const sha = (s) => "'sha256-" + crypto.createHash('sha256').update(s, 'utf8').digest('base64') + "'";
const favicon = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'app', 'icons', 'favicon-64.png')).toString('base64');
const csp = `default-src 'none'; script-src ${sha(js)}; style-src ${sha(css)}; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'`;
let single = html
  .replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/, `<meta http-equiv="Content-Security-Policy" content="${csp}">`)
  .replace(/<link rel="manifest"[^>]*>\n?/, '')
  .replace(/<link rel="apple-touch-icon"[^>]*>\n?/, '')
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" type="image/png" href="${favicon}">`);
single = single.split('<link rel="stylesheet" href="styles.css">').join(`<style>${css}</style>`);
single = single.split('<script src="config.js"></script>\n').join('');
single = single.split('<script src="app.js"></script>').join(`<script>${js}</script>`);
if (single.includes('href="styles.css"') || single.includes('src="app.js"') || single.includes('src="config.js"')) throw new Error('Einbetten fehlgeschlagen');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'Wiedervorlage_lokal.html');
fs.writeFileSync(out, single);
console.log(`Build ${version}: app/app.js (${(js.length / 1024).toFixed(0)} KB), app/sw.js, dist/Wiedervorlage_lokal.html (${(single.length / 1024).toFixed(0)} KB)`);
