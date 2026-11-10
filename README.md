# Wiedervorlage (PIA)

Einfache, offlinefähige Wiedervorlage für nicht dringende organisatorische Aufgaben in einer psychiatrischen Institutsambulanz.
Läuft als Web-App im Browser (Klinik-PC, iPhone), speichert lokal (IndexedDB) und sichert verschlüsselt (AES-256-GCM, Passphrase).

**Dieses Repository enthält nur Programmcode und Dokumentation – keine Aufgaben- oder Patientendaten.**
Die Daten liegen ausschließlich im Browser des jeweiligen Geräts, in verschlüsselten Sicherungsdateien und (ab Etappe 4) verschlüsselt im App-Ordner von Google Drive.

| Ordner | Inhalt |
|---|---|
| `src/` | Quellcode (wird zu `app/app.js` zusammengefügt) |
| `app/` | Veröffentlichte Web-App (GitHub Pages, Branch `gh-pages`) |
| `dist/` | Einzeldatei für die Nutzung als lokale Datei (ohne Synchronisation) |
| `tests/` | Logik-Tests (Node) und Browser-Tests (Playwright) |
| `docs/` | Architektur, Anleitung, Screenshots (fiktive Daten) |

Bauen und testen: `npm run build`, `npm run test:unit`, `npm run test:e2e`.

Rahmen: organisatorische Wiedervorlage – kein Patientenaktensystem, kein Befundarchiv, keine Alarmierung, keine medizinische Entscheidungsunterstützung.
