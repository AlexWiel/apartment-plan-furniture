# Wohnplaner – Wohnung zeichnen & einrichten

Statische Web-App (GitHub Pages), mit der man einen Wohnungsgrundriss zeichnet und Möbel maßstabsgetreu
ausprobiert. Ohne Server, ohne Build-Schritt – reines HTML, CSS und JavaScript (ES-Module, SVG).

**Live:** `https://alexwiel.github.io/apartment-plan-furniture/` (nach dem Aktivieren von GitHub Pages, siehe unten)

## Funktionen

- **Räume als Polygone** zeichnen (auch L-förmig/schräg). Ecken fangen am Raster und an bestehenden Ecken,
  Shift = 45°-Winkel. Ecken nachträglich ziehen, einfügen (Kreise auf den Kanten) und löschen.
- **Raster in jedem Raum** (10 / 20 / 25 / 50 / 100 cm), ein-/ausblendbar.
- **Türen & Fenster** auf Wände setzen und entlang der Wand verschieben; Anschlag und Öffnungsrichtung wählbar.
- **Möbelkatalog** (Wohnen, Essen, Schlafen, Küche, Bad, Büro) mit realistischen Standardmaßen, plus
  **eigene Möbel** mit beliebigen Maßen.
- Möbel verschieben, drehen (Griff oder Taste R), Größe ändern. **Leicht magnetisch**: rastet nur in der Nähe
  von Rasterlinien und Wänden ein; Magnet abschaltbar (M) oder beim Ziehen Alt gedrückt halten.
- Fläche und Wandmaße werden automatisch angezeigt.
- **Foto als Vorlage**: Foto oder Scan eines bestehenden Grundrisses laden („Foto“), bei Bedarf
  **Perspektive korrigieren** (vier Ecken setzen) und drehen, **Maßstab festlegen** (zwei Punkte einer bekannten
  Strecke anklicken, Länge eingeben) und dann Räume, Türen und Fenster darüber nachzeichnen. Deckkraft einstellbar,
  ausblendbar, sperrbar; wird mit dem Plan gespeichert (PNG-Export ohne Foto).
- **Rückgängig/Wiederholen** (Strg+Z / Strg+Y).
- **Speichern & Laden**:
  - automatische Zwischenspeicherung im Browser (nach dem Neuladen geht es weiter),
  - mehrere benannte Pläne im Browser („Speichern unter“ / „Öffnen“),
  - **Export/Import als JSON-Datei** zum Sichern, Teilen und Weiterarbeiten auf anderen Geräten,
  - **PNG-Export** des Plans.

Alle Maße in Zentimetern. Tastenkürzel: Hilfe-Button **?** in der App.

## Lokal starten

ES-Module brauchen einen Webserver (nicht per `file://` öffnen):

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## GitHub Pages aktivieren

1. Repository → **Settings → Pages** → bei *Source* **GitHub Actions** wählen.
2. Änderungen auf `main` mergen – der Workflow `.github/workflows/pages.yml` veröffentlicht die Seite.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `index.html`, `css/style.css` | Oberfläche |
| `js/main.js` | Start, Toolbar, Tastatur, Datei-Aktionen |
| `js/state.js` | Datenmodell, Validierung, Undo/Redo |
| `js/tools.js` | Zeichnen, Verschieben, Magnet/Fangen |
| `js/render.js` | SVG-Darstellung |
| `js/furniture.js` | Möbelkatalog und Symbole |
| `js/storage.js` | Browser-Speicher, JSON- und PNG-Export |
| `js/background.js` | Foto-Vorlage: Bildspeicher, Verkleinern, Drehen, Perspektivkorrektur |
| `js/photo.js` | Foto-Aktionen: laden, Maßstab, Perspektiv-Dialog |
| `js/view.js` | Zoom und Verschieben der Ansicht |
| `js/ui.js` | Möbel-Palette, Eigenschaften-Panel |
| `js/example.js` | Beispielwohnung |

### Dateiformat (JSON)

```json
{
  "version": 1,
  "name": "Meine Wohnung",
  "settings": { "gridSize": 25, "showGrid": true, "snap": true, "showDimensions": true, "wallThickness": 10 },
  "rooms": [{ "id": "r1", "name": "Wohnzimmer", "color": "#e3edf7", "points": [[0, 0], [500, 0], [500, 400], [0, 400]] }],
  "openings": [{ "id": "o1", "type": "door", "roomId": "r1", "wall": 2, "t": 0.5, "width": 90, "swing": "left", "flip": false }],
  "furniture": [{ "id": "f1", "type": "sofa", "name": "Sofa", "x": 250, "y": 300, "w": 200, "h": 90, "rotation": 0, "color": "#b0bec5" }],
  "customFurniture": [],
  "background": { "imageId": "img1", "x": 0, "y": 0, "cmPerPx": 1.2, "opacity": 0.6, "visible": true, "locked": true },
  "images": { "img1": { "dataUrl": "data:image/jpeg;base64,…", "width": 1600, "height": 1200 } }
}
```

Koordinaten in cm; Möbel-`x`/`y` ist der Mittelpunkt, `wall` der Index der Raumkante, `t` die Position darauf (0–1).
`background` und `images` sind optional (nur mit Foto-Vorlage); im Browser liegen die Fotos getrennt vom Plan.
