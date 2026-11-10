# Wiedervorlage – Technische Architektur (Entwurf Etappe 1)

Stand: 10.11.2026 · Status: Etappe 2 umgesetzt (lokal, ohne Synchronisation)

Dieses Dokument ist die technische Referenz für die Umsetzung. Die verständliche Fassung mit Empfehlung und Einrichtungsschritten steht in der Antwort im Chat.

---

## 1. Grundentscheidung

**Eine gemeinsame, statisch gehostete, offlinefähige Web-App (PWA) für Klinik-PC und iPhone.**

- Auslieferung über HTTPS (Empfehlung: GitHub Pages; Alternative: Cloudflare Pages).
- Keine eigene Server-Logik, keine Datenbank, keine externen JavaScript-Bibliotheken.
- Lokaler Hauptspeicher: IndexedDB.
- Synchronisation: Google Drive API v3, Bereich `appDataFolder`, Berechtigung ausschließlich `drive.appdata`.
- Ende-zu-Ende-Verschlüsselung im Browser (Web Crypto API).
- Zusätzliche lokale Sicherung über File System Access API (Chrome), Fallback Download/Upload.

Begründung gegen eine reine lokale `file://`-Datei als Hauptlösung: Google akzeptiert als „Autorisierte JavaScript-Quellen“ nur HTTPS-Ursprünge (Ausnahme: `localhost`). Eine `file://`-Seite kann den Google-Anmeldevorgang daher nicht regulär durchlaufen. Zudem keine Service-Worker, keine Updates ohne manuellen Dateiaustausch, auf dem iPhone praktisch nicht nutzbar.

---

## 2. Dateien der Anwendung (alle öffentlich, ohne Daten)

```
index.html              App-Oberfläche
app.js                  Anwendungslogik (klassisches Script, kein ES-Modul → auch file:// lauffähig)
styles.css              Gestaltung (helles/dunkles Theme)
sw.js                   Service Worker (Offline-Cache der App-Dateien, keine Daten)
manifest.webmanifest    Home-Bildschirm-Installation
icons/                  App-Symbole
config.js               Öffentliche Konfiguration: Google Client-ID (kein Geheimnis), Redirect-URI
```

Kein Client-Secret, keine Schlüssel, keine Aufgabeninhalte in diesen Dateien.

Hinweis GitHub Pages: Alle Pages-Projekte eines GitHub-Kontos teilen sich den Ursprung `https://<konto>.github.io` und damit den Browserspeicher. Auf demselben Konto keine weiteren Pages-Projekte mit fremdem Code betreiben (Cloudflare Pages vergibt dagegen je Projekt einen eigenen Ursprung).

---

## 3. Lokale Datenhaltung

### 3.1 Speicher

- IndexedDB-Datenbank `wiedervorlage`, Object Stores:
  - `tasks` – synchronisierte Felder je Aufgabe inkl. Versionsmetadaten
  - `local` – gerätelokale Felder je Aufgabe (`note`, `nextStep`, lokaler Änderungszeitpunkt)
  - `patients` – Patientenkürzel mit interner ID
  - `meta` – Geräte-ID, Zähler, Sync-Zustand, Einstellungen, Schlüssel (CryptoKey), Dateihandle der Sicherung
- `navigator.storage.persist()` wird beim Start angefordert.
- Erfolgsmeldungen erst nach `transaction.oncomplete`. Bei Fehler: sichtbare Meldung, Eingabe bleibt im Feld erhalten.
- Entwurf der Schnelleingabe wird fortlaufend lokal gespeichert (kein Verlust bei Neuladen/Fehlbedienung).
- Mehrere offene Tabs: Änderungen werden per `BroadcastChannel` verteilt; Synchronisation und Sicherung über `navigator.locks` serialisiert.

### 3.2 Klartext lokal

Lokal liegen die Daten unverschlüsselt im Browserprofil (Klinik-PC: Windows-Benutzerprofil auf dem RDS-Server; iPhone: iOS-Datenschutz/Gerätecode). Eine zusätzliche lokale Verschlüsselung brächte nur dann Schutz, wenn die Passphrase bei jedem Start eingegeben würde. Für Version 1 nicht vorgesehen; optional später (zusammen mit einer App-Sperre nur nach ausdrücklicher Zustimmung).

---

## 4. Datenmodell

### 4.1 Aufgabe – synchronisierter Teil

| Feld | Typ | Bemerkung |
|---|---|---|
| `id` | UUID v4 | `crypto.randomUUID()` bzw. Fallback über `getRandomValues` |
| `title` | String | Pflicht |
| `type` | Enum | `brief`, `bescheinigung`, `mail`, `rueckruf`, `rezept`, `befund`, `antrag`, `doku`, `rs`, `piateam`, `intervision`, `vorbereitung`, `sonstiges` |
| `typeAuto` | Bool | Art wurde automatisch erkannt |
| `patientId` | UUID \| null | Verweis auf `patients` |
| `recall` | `YYYY-MM-DD` \| null | Wiedervorlage, Kalenderdatum ohne Uhrzeit; null = unbekannt |
| `deadline` | `YYYY-MM-DD` \| null | Frist |
| `important` | Bool | Standard `false` |
| `status` | Enum | `open`, `waiting`, `done` |
| `createdAt` | ISO-UTC | |
| `updatedAt` | ISO-UTC | nur Anzeige, nicht für Konfliktlogik |
| `doneAt` | ISO-UTC \| null | |
| `deleted` | Bool | Löschmarker |
| `purged` | Bool | Inhalt endgültig entfernt, Löschmarker bleibt |
| `postpones` | Map Gerät→Anzahl | G-Counter, Summe = Anzahl Verschiebungen |
| `lastPostponedAt` | ISO-UTC \| null | Maximum |
| `recurrence` | null | reserviert für spätere Wiederholungen (z. B. `{kind:"weekly"\|"monthly"\|"weekdays"\|"afterDone", interval, days}`) |
| `_clock` | Objekt | Versionsmetadaten, siehe 5.2 |

### 4.2 Aufgabe – gerätelokaler Teil (wird nie synchronisiert)

`note`, `nextStep`, `localUpdatedAt`. Getrennter Store; der Sync-Code liest und schreibt diesen Store nicht. Damit kann eine Änderung vom iPhone diese Felder technisch nicht überschreiben.

Annahme: Die Felder sind auf jedem Gerät lokal möglich, auf dem iPhone standardmäßig ausgeblendet (Hinweis „nur am Klinik-PC“). Der Verschiebungshinweis („Bereits fünfmal verschoben …“) erscheint nur dort, wo das Feld „Nächster Schritt“ verfügbar ist.

### 4.3 Patient

`{ id: UUID, label: "Müller, M.", createdAt, _clock }`

- Gleiches Kürzel ≠ gleiche Person. Bei Eingabe eines vorhandenen Kürzels erscheint eine Auswahl: vorhandene(r) Patient(en) mit Anzahl und Titeln offener Aufgaben, darunter „Neuer Patient mit gleichem Kürzel“. Enter übernimmt den markierten Eintrag (bewusste Auswahl statt stiller Zuordnung).
- Bei Namensgleichheit unterscheidbare Anzeige, z. B. „Müller, M. (2)“.
- Eingabeprüfung: Format „Nachname, X.“ wird vorgeschlagen; keine weiteren Stammdaten vorgesehen.

### 4.4 Formatversion

`schemaVersion` in Datenbank, Sync-Dateien und Sicherungen. Migrationen sind fortlaufend nummerierte Funktionen; vor jeder Migration wird automatisch eine Sicherung erstellt.

---

## 5. Synchronisation

### 5.1 Ablage in Google Drive (`appDataFolder`)

```
wv-keys.json            Schlüsselinformationen (Salt, Iterationen, verpackter Datenschlüssel) – ohne Klartextinhalte
wv-dev-<geräte-id>.bin  Vollständiger, verschlüsselter Datenstand je Gerät
```

**Kernprinzip: Jedes Gerät schreibt ausschließlich seine eigene Datei.** Andere Dateien werden nur gelesen. Damit gibt es in Drive keine konkurrierenden Schreibzugriffe auf dieselbe Datei; ein älterer Upload eines Geräts kann den Stand eines anderen Geräts nicht überschreiben. Drive braucht dafür weder Sperren noch Transaktionen.

Ablauf eines Sync-Durchgangs (unter `navigator.locks`):

1. Zugriffstoken gültig? Sonst Status „Anmeldung erneuern“ (kein automatischer Dialog).
2. `files.list` (`spaces=appDataFolder`, Felder `id,name,version,modifiedTime,size`).
3. Für jede fremde Gerätedatei mit geänderter `version`: herunterladen, entschlüsseln, prüfen, in einer IndexedDB-Transaktion zusammenführen (5.3).
4. Wenn lokale Änderungen seit dem letzten Upload vorliegen: gesamten synchronisierten Stand serialisieren, komprimieren (sofern `CompressionStream` verfügbar), verschlüsseln, eigene Datei per `uploadType=media` ersetzen.
5. Zeitpunkt und Status speichern.

Auslöser: App-Start, Rückkehr in die App (`visibilitychange`), `online`-Ereignis, 5 s nach der letzten Änderung (entprellt), Button „Jetzt synchronisieren“. Fehler werden still protokolliert (ohne Inhalte) und als Status angezeigt; erneuter Versuch mit wachsendem Abstand, keine wiederholten Dialoge.

Neues Gerät oder gelöschtes Browserprofil: neue Geräte-ID. Die Datei der alten ID bleibt lesbar und wird normal eingemischt. Veraltete Gerätedateien können später gefahrlos aufgeräumt werden (nur wenn ihr Inhalt vollständig im eigenen Stand enthalten ist). Die Geräte-ID wird bewusst nicht aus Sicherungen übernommen, damit nie zwei Geräte dieselbe Datei schreiben.

Rollback- und Löschangriffe: Eine ältere oder gelöschte Datei kann den Stand nicht zurücksetzen, weil die Zusammenführung nur Neueres übernimmt; fehlende eigene Dateien werden neu hochgeladen.

### 5.2 Versionsinformationen

- Jedes Gerät führt einen fortlaufenden Zähler `c`.
- Jede Benutzeraktion erhält einen Punkt `dot = (geräteId, c)`; alle in dieser Aktion geschriebenen Felder tragen diesen Punkt sowie einen Zeitstempel `t`.
- Jede Aufgabe trägt einen Versionsvektor `vv` (Gerät → höchster eingemischter Zähler dieses Geräts für diese Aufgabe).

### 5.3 Zusammenführung (je Feld)

Für ein Feld mit lokalem Wert `a` (Punkt `dA,cA`) und entferntem Wert `b` (`dB,cB`):

1. Gleicher Punkt → identisch.
2. `vv_B[dA] ≥ cA` → B kannte `a` bereits → `b` übernehmen.
3. `vv_A[dB] ≥ cB` → A kannte `b` bereits → `a` behalten.
4. Sonst gleichzeitige Änderung:
   - gleiche Werte → kein Konflikt;
   - verschiedene Werte → **Konflikt**: vorläufig gilt der spätere Zeitstempel (Gleichstand: Geräte-ID), der andere Wert wird als Konflikteintrag gespeichert.
5. `vv` = elementweises Maximum; `postpones` = Maximum je Gerät.

Konflikteinträge: Map mit deterministischer ID (Hash aus Aufgabe, Feld, beiden Punkten), damit beide Geräte denselben Konflikt nur einmal führen; `resolved` wird per ODER zusammengeführt. Die Auflösung durch den Nutzer ist eine normale neue Änderung.

Semantische Zusatzregel (Sicherheitsprinzip „im Zweifel sichtbar“): Wird eine Aufgabe auf einem Gerät erledigt oder gelöscht, während sie auf dem anderen gleichzeitig bearbeitet oder verschoben wurde, entsteht ein Konflikt vom Typ „erledigt/gelöscht vs. bearbeitet“. Solange er offen ist, erscheint die Aufgabe unter „Heute & überfällig“ mit Konfliktmarkierung und den Wahlmöglichkeiten „Erledigt lassen“ / „Wieder öffnen“ bzw. „Gelöscht lassen“ / „Wiederherstellen“.

Abgedeckte Fälle:

| Fall | Ergebnis |
|---|---|
| iPhone erledigt, PC bearbeitet Titel offline | Konflikt (Zusatzregel), Aufgabe bleibt sichtbar |
| PC verschiebt, iPhone ändert Patient | automatisch zusammengeführt |
| Gerät A löscht, Gerät B bearbeitet | Konflikt (Zusatzregel), Aufgabe bleibt sichtbar |
| Beide ändern den Titel unterschiedlich | Konflikt, beide Fassungen sichtbar |
| Beide setzen „erledigt“ | kein Konflikt |
| Beide verschieben | späteres Datum vorläufig, Konflikt nur bei unterschiedlichem Ergebnis; Verschiebungszähler addiert sich |

### 5.4 Endgültiges Löschen

Aus „Erledigt“ endgültig löschen: Inhalte (`title`, `patientId`) werden geleert, `purged=true`, der Löschmarker bleibt dauerhaft (ca. 100 Byte je Aufgabe), damit die Aufgabe bei keiner späteren Synchronisation wieder auftaucht.

---

## 6. Google-Anmeldung (OAuth)

- Google-Cloud-Projekt mit OAuth-Client Typ „Webanwendung“.
- Autorisierter JavaScript-Ursprung: `https://<konto>.github.io`; Weiterleitungs-URI: `https://<konto>.github.io/wiedervorlage/`.
- Berechtigung: nur `https://www.googleapis.com/auth/drive.appdata` (von Google als „nicht sensibel“ eingestuft).
- Ablauf: Weiterleitung (Redirect) auf `accounts.google.com/o/oauth2/v2/auth` mit `response_type=token`, zufälligem `state`; nach Rückkehr wird der Fragment-Teil der URL sofort ausgelesen und per `history.replaceState` entfernt. Bei Erneuerung `prompt=none` (keine Oberfläche, wenn Sitzung und Zustimmung bestehen).
- Grund für Redirect statt Popup: ein Code-Pfad für PC und iPhone, keine Popup-Blocker, keine Probleme mit abgetrennter `window.opener`-Verbindung; im iPhone-Home-Bildschirm-Modus voraussichtlich robuster als Popups (muss getestet werden).
- Token: nur im Speicher bzw. `sessionStorage`, Laufzeit ca. 1 Stunde, kein Refresh-Token (ohne eigenen Server nicht möglich).
- Keine automatische Weiterleitung beim Start (sonst Datenverlustgefahr bei laufender Eingabe und Fehlseiten bei blockiertem Netz). Abgelaufenes Token → Status „Zum Synchronisieren einmal anmelden“; Klick → Weiterleitung, Rückkehr in die App.
- Veröffentlichungsstatus des Projekts: „In Produktion“. Im Status „Testen“ verfallen Autorisierungen nach 7 Tagen.

Einordnung des Verfahrens: Google bezeichnet den direkten Implicit-Flow als Altverfahren und empfiehlt für Browser-Apps den Authorization-Code-Flow – der bei Google für Web-Clients nach meinem Kenntnisstand aber einen Server mit Client-Secret erfordert. Risiko Token-Abgriff wird begrenzt durch: strikte CSP, keinen fremden Code, minimale Berechtigung (nur eigener App-Ordner), kurze Laufzeit, Ende-zu-Ende-Verschlüsselung (ein abgegriffenes Token gibt nur Zugriff auf verschlüsselte Daten). Ausbauoption bei Bedarf: kleiner Token-Dienst (z. B. Cloudflare Worker) für Refresh-Tokens → Synchronisation ohne stündliche Anmeldung, aber zusätzliche Komponente mit Geheimnis.

---

## 7. Verschlüsselung

- Passphrase → Schlüsselableitung PBKDF2-HMAC-SHA-256, 600 000 Iterationen, 16 Byte Zufalls-Salt → Schlüsselverschlüsselungsschlüssel (KEK).
- Zufälliger 256-Bit-Datenschlüssel (DEK), einmalig erzeugt, mit KEK verpackt in `wv-keys.json` abgelegt (inkl. Prüfwert). Vorteil: Passphrasenwechsel ohne Neuverschlüsselung aller Daten.
- Datenverschlüsselung: AES-256-GCM, für jede Verschlüsselung neuer 96-Bit-Zufalls-IV (`crypto.getRandomValues`). Erwartete Anzahl Verschlüsselungen je Schlüssel liegt um Größenordnungen unter der für Zufalls-IVs empfohlenen Grenze von 2³².
- Zusatzdaten (AAD): Formatversion, Dateiart, Geräte-ID → Vertauschen von Dateien wird erkannt.
- Lokal: DEK als nicht exportierbarer `CryptoKey` in IndexedDB. Passphrase wird nie gespeichert.
- Passphrase vergessen:
  - Solange mindestens ein Gerät die Daten vollständig hat: „Neu einrichten mit neuer Passphrase“ (neuer DEK, Neuverschlüsselung, Upload; andere Geräte geben die neue Passphrase ein).
  - Wenn zusätzlich alle Geräte ihre Daten verloren haben: Drive-Daten und Sicherungsdateien sind nicht wiederherstellbar. Das ist die beabsichtigte Folge echter Ende-zu-Ende-Verschlüsselung.
- Für Google sichtbar bleiben: Existenz, Anzahl, Größe und Änderungszeitpunkte der Dateien, Zugriffszeitpunkte/IP-Adressen, Name der App im Google-Konto.

---

## 8. Lokale Sicherung

- Chrome: `showDirectoryPicker()` → Ordner einmalig wählen (Empfehlung: persönliches Netzlaufwerk, nicht das Chrome-Profil); Ordnerhandle in IndexedDB. Ab Chrome 122 bietet Chrome dauerhafte Berechtigungen an; sonst nach Neustart ein Klick „Sicherung wieder verbinden“.
- Geschrieben werden:
  - `Wiedervorlage_aktuell.json` – 10 s nach Änderungen (entprellt),
  - `Wiedervorlage_JJJJ-MM-TT_HH-MM.json` – höchstens eine pro Tag, die letzten 30 bleiben erhalten.
- Nach jedem Schreiben: Zurücklesen, Entschlüsseln, Strukturprüfung. Erst danach gilt die Sicherung als erfolgreich.
- Fallback (keine API oder per Richtlinie gesperrt; iPhone): „Sicherung herunterladen“ / „Sicherung laden“.
- Inhalt: vollständiger Stand inkl. lokaler Felder, verschlüsselt. Der Dateikopf enthält Salt, Iterationen und verpackten DEK → Wiederherstellung allein mit Datei und Passphrase möglich, auch ohne Google.
- Nach Passphrasenwechsel benötigen ältere Sicherungsdateien die damalige Passphrase.
- Statusanzeige: letzte erfolgreiche Sicherung, ungesicherte Änderungen, Datei erreichbar, letzter Fehler. Hinweis, wenn ungesicherte Änderungen älter als 24 h sind.
- Import: Prüfung → Vorschau (neu / geändert / identisch / Konflikte) → Zusammenführung mit derselben Logik wie die Synchronisation. Kein blindes Überschreiben.

---

## 9. Datums- und Sortierlogik

- Alle Wiedervorlagen/Fristen sind Kalenderdaten; Rechnung über `Date.UTC(J, M, T)` → unabhängig von Zeitumstellung. „Heute“ = lokales Datum des Geräts.
- Schnellwahl bei der Eingabe: Morgen, Ende der Woche (Freitag dieser Woche; am Freitag heute; am Wochenende der kommende Freitag), 1–4 Wochen, unbekannt (kein Datum), eigenes Datum. Standard: 1 Woche.
- Verschieben: `neu = max(heute, wiedervorlage) + Intervall` (ohne Datum: ab heute). „+1 Monat“: gleicher Tag im Folgemonat, bei fehlendem Tag letzter Tag des Monats (31.01. → 28./29.02.). Frist bleibt unverändert.
- Abstand in Tagen: `d(x) = x − heute`.

Bereiche (nur `open`/`waiting`, nicht gelöscht):

| Bereich | Bedingung |
|---|---|
| Heute & überfällig | `d(recall) ≤ 0` oder `d(deadline) ≤ 2` oder offener Konflikt |
| Nächste 7 Tage | sonst `d(recall) ≤ 7` |
| Später | sonst |
| Wiedervorlage unbekannt | ohne Wiedervorlagedatum und ohne Frist innerhalb von 2 Tagen (eigener, sichtbarer Bereich; in „Offen gesamt“ enthalten) |

Unterbereich „Länger überfällig“ (eingeklappt, in allen Zählern enthalten): `d(recall) < −7`, nicht wichtig, keine Frist innerhalb von 3 Tagen, kein Konflikt.

Fristfarbe: `d ≤ 0` rot · `1–3` gelb · sonst neutral.

Sortierschlüssel (alle Bereiche, stabil):
1. Fristdringlichkeit: `d ≤ 0` → 0 · `1–2` → 1 · `3` → 2 · sonst 3
2. Wichtig vor nicht wichtig
3. Wiedervorlage aufsteigend
4. Frist aufsteigend (ohne Frist zuletzt)
5. Erstellungszeitpunkt, dann ID

Zähler:
- **Überfällig**: `d(recall) < 0` oder `d(deadline) < 0`
- **Heute fällig**: nicht überfällig und (`d(recall) = 0` oder `d(deadline) = 0`)
- **Offen gesamt**: alle `open` + `waiting`

Der Bereich „Heute & überfällig“ zeigt in der Überschrift seine Zusammensetzung (z. B. „3 überfällig · 4 heute · 2 Frist in 1–2 Tagen“), damit Zähler und Liste nicht widersprüchlich wirken.

---

## 10. Sicherheit des Programmcodes

- Content-Security-Policy per `<meta>`: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src https://www.googleapis.com; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'`.
- Einbettungsschutz per Skript (GitHub Pages kann `frame-ancestors` nicht als Header setzen).
- Freitext ausschließlich über `textContent`/DOM-Knoten, nie über `innerHTML`.
- Keine Konsolenausgaben mit Inhalten; Fehlerprotokoll nur mit Fehlercodes; keine Telemetrie; Aufgabeninhalte nie in URLs.
- Service Worker cacht nur App-Dateien. Updates werden nicht still aktiviert: „Neue Version x.y verfügbar – jetzt aktualisieren“.
- Änderungen am Code nachvollziehbar über die Versionshistorie des Repositorys; Zwei-Faktor-Anmeldung für GitHub und Google.
- Restrisiko: Wer das Hosting-Konto übernimmt, kann veränderten Code ausliefern. Das ist bei jeder gehosteten Web-App so und wird durch 2FA und bestätigungspflichtige Updates begrenzt, nicht beseitigt.

---

## 11. Kompatibilität und Leistung

- Klinik-PC (Prüfung 10.11.2026): aktuelle Chrome-Version, keine Richtlinien, die Browserdaten beim Schließen löschen, Google-Konten einschränken oder Ordnerzugriffe sperren; Google-Anmeldung, Drive-Schnittstelle und github.io erreichbar. Lokales Browserprofil kann bei Profilbereinigung verloren gehen → Sicherung auf dem persönlichen Netzlaufwerk.
- Ziel weiterhin: Sprachumfang ES2017 (Safari iOS 16+), keine neueren CSS-Funktionen wie `:has()` oder Container-Queries.
- Testumgebung: Chromium stürzt ab, wenn in einem Inkognito-artigen Profil ein Ordner-Handle in IndexedDB gespeichert wird. In normalen Profilen funktioniert es (getestet inkl. Neustart). Die Ordner-Sicherung daher nicht im Inkognito-Fenster einrichten.
- Remote-Desktop: keine Animationen, Transparenzen, Schatten-/Unschärfeeffekte; flache Flächen.
- Schrift: `"Segoe UI", system-ui, -apple-system, sans-serif`; keine externen Schriften.
- 500–1000 Aufgaben: Berechnung im Speicher; Liste „Erledigt“ wird seitenweise (je 50) aufgebaut.

---

## 11a. Aufgabenarten und Erkennung

13 Arten in dieser Reihenfolge: Doku, Ambulanzbrief, Bescheinigung, Mail-Antwort, Rückruf, Rezept, Befund/Labor, Antrag/Formular, RS, PIA-Team, PIA-Intervision, Vorbereitung, Sonstiges.
Erkennung über Stichwörter im Titel (früheste Fundstelle gewinnt). Kurzkürzel wie „RS“ nur als ganzes Wort. „Vorbereitung/vorbereiten“ ist schwach: gilt nur, wenn keine andere Art erkannt wird („Rezept vorbereiten“ → Rezept). Annahme: „RS“ = Rücksprache (Stichwort „Rücksprache“ wird ebenfalls erkannt).

## 11b. Machbarkeitstest Google Drive (10.11.2026)

Testseite `verbindungstest.html` (Anmeldung per Weiterleitung, nur `drive.appdata`, Testdatei anlegen/lesen/überschreiben/löschen):

| Umgebung | Ergebnis |
|---|---|
| Klinik-PC, Chrome 147, Browser-Tab | bestanden; Erneuerung ohne Rückfrage (`prompt=none`) bestanden |
| iPhone, Safari-Tab | bestanden |
| iPhone, Home-Bildschirm-App | bestanden – Rückkehr von Google in die App funktioniert |

Hochladen ca. 1,3–2,1 s, Lesen ca. 0,7–0,9 s. Die Drive-Versionsnummer steigt nicht zwingend um 1 (1 → 3) – Änderungserkennung nur über „Version ungleich“.
Google-Projekt im Status „Testen“ (Veröffentlichung verlangt Startseite und Datenschutzerklärung); Folge: Zustimmung etwa alle 7 Tage erneut.

## 12. Etappen (angepasste Reihenfolge)

1. Architektur (dieses Dokument) + Verbindungstest am Klinik-PC
2. Lokale Aufgabenverwaltung inkl. Sicherung – Datenmodell von Beginn an synchronisationsfähig
   - parallel: **Machbarkeitstest Google** (Anmeldung + Testdatei im App-Ordner schreiben/lesen) auf Klinik-PC und iPhone, sobald Hosting und OAuth-Client eingerichtet sind
3. Erweiterte Bedienung
4. Verschlüsselte Synchronisation und Konfliktbehandlung
5. iPhone-Feinschliff, Gesamttests, Screenshots, Anleitungen
