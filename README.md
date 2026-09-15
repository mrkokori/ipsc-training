# IPSC Trainings-Bibliothek

Eine Web-App für IPSC-Schützen: Übungen finden, Aufbau ansehen, mit Par-Timer trainieren und Ergebnisse auswerten. Läuft im Browser und offline, ohne Anmeldung.

**App öffnen:** https://mrkokori.github.io/ipsc-training/

## Funktionen

- **Übungsbibliothek** mit 19 Standard-Übungen (Ziehen, Magazinwechsel, Zielwechsel, Bewegung, starke/schwache Hand, Startpositionen) und eigenen Trainings
- **Stage-Skizzen-Editor** mit Targets, Plates, Poppern, Pendlern, No-Shoots, Wänden, Boxen und Props
- **Suche und Favoriten**
- **Par-Timer** mit zufälliger Startverzögerung, Par-Signal und mehreren Durchgängen
- **Ergebnisse nach IPSC-Wertung** (Major/Minor, Miss, No-Shoot, Procedural) mit Hit-Factor, Bestwert, Durchschnitt, A-Quote und Verlaufsdiagramm
- **Teilen** per Link, QR-Code oder Datei, Skizze als Bild speichern
- **Export und Import** aller Daten als JSON-Datei

## Datenschutz

Alle Trainings, Ergebnisse und Einstellungen werden ausschließlich lokal im Browser gespeichert. Es gibt keinen Server und kein Tracking. Deshalb regelmäßig über „Alles exportieren“ sichern. Auf dem iPhone die App am besten über *Teilen → Zum Home-Bildschirm* hinzufügen.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | Seitenstruktur |
| `app.js` | gesamte App-Logik |
| `style.css` | Gestaltung |
| `data/drills.js` | Standard-Übungen |
| `lib/qrcode.js` | QR-Code-Erzeugung (Fremdbibliothek, MIT-Lizenz) |
| `sw.js` | Service Worker für Offline-Betrieb |
| `tests/run-tests.js` | automatische Tests |

## Entwicklung

Tests lokal ausführen (Node.js 22 oder neuer):

```bash
npm install
npm test
```

Auf GitHub laufen die Tests bei jedem Commit automatisch (Tab **Actions**).

**Neue Version veröffentlichen:** Die Versionsnummer in `app.js` (`APP_VERSION`) und in `sw.js` (`VERSION`) gleichzeitig erhöhen. Nur dann bekommen bestehende Nutzer den Hinweis „Neue Version verfügbar“, und der Offline-Cache wird erneuert. Die Tests prüfen, dass beide Nummern übereinstimmen.

## Sicherheit

Die App ersetzt keine Sicherheitsunterweisung. Es gelten immer die Standregeln und die IPSC-Regeln. Trockentraining nur ohne Munition im Raum.

## Lizenzen

- `lib/qrcode.js`: QR Code Generator for JavaScript, © 2009 Kazuhiko Arase, MIT-Lizenz
