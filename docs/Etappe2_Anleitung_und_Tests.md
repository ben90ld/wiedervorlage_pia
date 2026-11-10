# Wiedervorlage – Etappe 2: Anleitung, Tests, offene Punkte

Stand 10.11.2026 · Version 0.2.1 · lokal nutzbar, **noch ohne Google-Synchronisation**

## 1. Sofort ausprobieren am Klinik-PC (lokale Datei)

1. Datei `Wiedervorlage_lokal.html` speichern, z. B. nach `H:\Documents\Wiedervorlage\`.
2. Doppelklick → öffnet in Chrome. Optional als Lesezeichen ablegen.
3. Erste Aufgabe oben eingeben, Enter.
4. **Sicherung einrichten** (oben rechts gelber Knopf „Sicherung einrichten“):
   - Passphrase festlegen (5–6 zufällige Wörter, auf Papier notieren).
   - Einstellungen → „Sicherungsordner wählen“ → eigenen Ordner anlegen, z. B. `H:\Documents\Wiedervorlage-Sicherung`.
   - Chrome fragt nach Schreibzugriff → erlauben (falls angeboten: „Bei jedem Besuch erlauben“).
5. Ab dann wird nach jeder Änderung automatisch gesichert und geprüft. Oben rechts steht „Gesichert hh:mm“.

Hinweise:
- Die lokale Datei und die spätere gehostete App haben **getrennte** Speicher. Umzug später über „Sicherung laden“ (wird zusammengeführt, nichts geht verloren).
- Nach einem Chrome-Neustart kann ein Klick auf „Sicherung wieder verbinden“ nötig sein.
- Zusätzlich jederzeit möglich: Einstellungen → „Sicherung herunterladen“.

## 2. Bedienung in Kürze

Wiedervorlage-Schnellwahl: Morgen · Ende der Woche (Freitag) · 1 / 2 / 3 / 4 Wochen · unbekannt · eigenes Datum. Aufgaben mit unbekanntem Datum stehen im Bereich „Wiedervorlage unbekannt“ und rücken bei naher Frist automatisch nach „Heute & überfällig“.

| Taste | Wirkung |
|---|---|
| N | Fokus in die Schnelleingabe |
| / | Suche |
| Enter | Speichern bzw. Aufgabe öffnen |
| ↑ ↓ | in der Liste bewegen |
| E | erledigt (mit Rückgängig) |
| T / W / M | +1 Tag / +1 Woche / +1 Monat |
| Entf | löschen (mit Rückgängig) |
| Esc | Bearbeitung schließen (speichert) · Suche leeren |

## 3. Wiederherstellung

- Startbildschirm ohne Daten zeigt „Sicherungsdatei laden“ und „Aus Sicherungsordner wiederherstellen“.
- Passphrase eingeben → Vorschau (neu / aktualisiert / unverändert / Konflikte) → „Zusammenführen“.
- Eine ältere Sicherung überschreibt nie neuere Änderungen.

## 4. Durchgeführte Tests (automatisiert, Chromium unter Linux)

41 Logik-Tests (Node) und 24 Browser-Tests (Playwright/Chromium), alle bestanden:

- Datumslogik: Monats-/Jahreswechsel, Schaltjahr, Zeitumstellung, „+1 Monat“ am Monatsende, Verschieben ab späterem Zeitpunkt (Beispiel 10.11./15.11. → 22.11.).
- Einordnung, Sortierung, Zähler; Frist heute/morgen/übermorgen bei späterer Wiedervorlage; länger überfällige Aufgaben eingeklappt, aber gezählt.
- Schnelleingabe (Enter, Leeren, Fokus, Standardwerte, Arterkennung inkl. neuer Arten), Patientenauswahl mit gleichem Kürzel, Entwurf übersteht Neuladen.
- Erledigen/Verschieben/Löschen mit Rückgängig, Bearbeiten mit automatischem Speichern und Esc, Erledigt-Bereich (Suche, Wiederherstellen, endgültig löschen).
- Suche (Titel, Patient, Notiz), Filter, Tastatur, XSS-Schutz, keine Inhalte in der Konsole, Farbschema.
- Sicherung: verschlüsselt (kein Klartext in der Datei), Wiederherstellung in leerem Profil, falsche Passphrase, Zusammenführung in beide Richtungen, Konflikt (erledigt vs. bearbeitet) mit Klärung, Ordner-Sicherung mit Prüfung und Tageskopie, nicht erreichbarer Ordner, 24-h-Hinweis, ungültige und neuere Formate, Migrationspfad.
- Lokale Einzeldatei (file://), Offline-Start der gehosteten Fassung, iPhone-13-Darstellung **simuliert in Chromium**.
- Leistung mit 1.000 Aufgaben: Neustart bis bedienbar ca. 0,2 s, Listenaufbau ca. 30–40 ms, Suche ca. 25–40 ms.

Nicht getestet: echtes Safari/iPhone, echter Klinik-PC, echte Ordnerauswahl per Dialog (im Test über das browserinterne Dateisystem nachgebildet), Windows-Schriftbild (Segoe UI).
