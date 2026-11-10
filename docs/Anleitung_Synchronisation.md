# Wiedervorlage – Synchronisation einrichten (ab Version 0.4.0)

Adresse: https://ben90ld.github.io/wiedervorlage_pia/

## Was synchronisiert wird

| Wird synchronisiert (verschlüsselt) | Bleibt nur auf dem Gerät |
|---|---|
| Titel, Patientenkürzel, Art, Wiedervorlage, Frist, Wichtig, Status, Erledigt-/Löschmarker | Notizen, Einstellungen, Sicherungsordner |

Die Daten werden **vor** der Übertragung mit deiner Passphrase verschlüsselt und nur im versteckten App-Ordner deines Google Drive abgelegt. Google sieht nur Dateinamen, Größe und Zeitpunkte.

## 1. Klinik-PC (zuerst)

1. Wiedervorlage öffnen. Erscheint „Neue Version verfügbar“ → **Jetzt aktualisieren**.
2. Oben rechts **Regler-Symbol** (Einstellungen) → **Synchronisation einrichten**.
3. Google: Konto wählen → ggf. „Weiter“ → **Zulassen**.
4. Zurück in der Wiedervorlage:
   - Hast du für die Sicherung schon eine Passphrase festgelegt, gilt diese auch für die Synchronisation – fertig.
   - Sonst erscheint „Passphrase für Synchronisation und Sicherung“: 5–6 zufällige Wörter, zweimal eingeben, Haken setzen, **Festlegen**. Passphrase auf Papier notieren.
5. Oben erscheint ein grünes Häkchen bzw. „Synchronisiert hh:mm“.

## 2. iPhone (Home-Bildschirm-App)

1. App über das Symbol öffnen. Erscheint „Neue Version verfügbar“ → **Jetzt aktualisieren**. (Kein Hinweis? App ganz schließen und neu öffnen.)
2. **Regler-Symbol** → **Synchronisation einrichten** → Google: Konto wählen → **Zulassen**.
3. „Passphrase der Synchronisation“: dieselbe Passphrase wie am PC eingeben → **Entsperren**.
4. Die Aufgaben vom PC erscheinen.

## Im Alltag

- Beim Öffnen verbindet sich die App kurz automatisch mit Google (kurzer Wechsel und zurück) und gleicht ab.
- Danach wird nach jeder Änderung nach wenigen Sekunden übertragen, außerdem alle 5 Minuten und beim Zurückkehren in die App.
- Symbol oben in der Leiste: grünes Häkchen = synchronisiert. Antippen = sofort abgleichen.
- Offline arbeiten ist jederzeit möglich; Änderungen werden später übertragen.
- Etwa alle 7 Tage fragt Google einmal erneut „Zulassen?“ (Testmodus des Google-Projekts).
- Gleichzeitige widersprüchliche Änderungen werden nicht stillschweigend verworfen: Die Aufgabe erscheint unter „Heute & überfällig“ mit „Konflikt prüfen“; beim Öffnen wählst du die gültige Fassung.

## Passphrase ändern oder vergessen

- Einstellungen → **Neue Passphrase festlegen**. Auf dem anderen Gerät wird danach einmal die neue Passphrase abgefragt.
- Vergessen: Solange ein Gerät die Daten hat, dort eine neue Passphrase festlegen. Sind alle Geräte leer und die Passphrase vergessen, sind die Daten in Google Drive nicht wiederherstellbar.
