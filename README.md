# D&D 5e PDF Character Export

Ein Modul für **Foundry VTT**, das Spielercharaktere des **dnd5e**-Systems in den offiziellen, ausfüllbaren D&D-5E-Charakterbogen (PDF) exportiert – mit Werten, Zaubern, Porträt und optionalem Anhang.

![Foundry v12–v14](https://img.shields.io/badge/Foundry-v12%E2%80%93v14-orange) ![dnd5e 3.x+](https://img.shields.io/badge/dnd5e-3.x%2B-red)

## Manifest-URL

```
https://github.com/PK0o/Foundry_DnD_Character_Export/releases/latest/download/module.json
```

## Installation

### The Forge

1. Auf [forge-vtt.com](https://forge-vtt.com) die **Bazaar** öffnen.
2. Links **„Install From Manifest“** wählen.
3. Die Manifest-URL oben einfügen und auf **„Install module“** klicken.
4. Welt starten → **Spieleinstellungen → Module verwalten** → „D&D 5e PDF Character Export“ aktivieren.

Updates: In der Bazaar auf **„Update All Packages“** klicken.

### Foundry (selbst gehostet)

1. Im Setup-Bildschirm **Add-on Modules → Install Module** öffnen.
2. Unten bei **Manifest URL** die URL einfügen → **Install**.
3. In der Welt unter **Module verwalten** aktivieren.

## Benutzung

- **Charakterbogen:** in der Kopfzeile (bei v13/v14 im ⋮-Menü) **„Als PDF-Charakterbogen exportieren“**.
- **Akteure-Seitenleiste:** Rechtsklick auf einen Charakter → gleicher Eintrag.
- **Makro:**
  ```js
  // mit Dialog
  game.modules.get("dnd5e-pdf-export").api.exportActor(actor);
  // ohne Dialog
  game.modules.get("dnd5e-pdf-export").api.exportActor(actor, {
    portrait: true, featureDescriptions: true, spellDescriptions: false, flatten: false
  });
  ```

Optionen im Dialog:

| Option | Wirkung |
|---|---|
| Porträt einfügen | Akteursbild im Feld „Character Appearance“ (Seite 2) |
| Beschreibungen der Merkmale im Anhang | vollständige Texte aller Merkmale als Zusatzseiten |
| Beschreibungen der Zauber im Anhang | vollständige Zaubertexte als Zusatzseiten |
| Formular fixieren | PDF ist danach nicht mehr editierbar (sonst bleiben alle Felder bearbeitbar) |

Exportieren können alle Spieler, die den Charakter mindestens sehen dürfen.

## Was wird übertragen

| Seite | Inhalt |
|---|---|
| 1 | Name, Klasse(n) & Stufe inkl. Unterklasse, Hintergrund, Volk, Gesinnung, EP, Spielername, Inspiration, Attribute, Rettungswürfe & Fertigkeiten mit Übungs-Häkchen, Übungsbonus, passive Wahrnehmung, RK, Initiative, Bewegung, TP, Trefferwürfel, Todesrettungswürfe, 3 Waffen, weitere Angriffe, Zauberangriff/SG, Zaubertricks mit Schaden, Übungen & Sprachen, Ausrüstung, Münzen, Persönlichkeit/Ideale/Bindungen/Makel, Merkmale (gruppiert, mit Nutzungen), Sinne, weitere Bewegungsarten, Resistenzen |
| 2 | Alter, Größe, Gewicht, Augen, Haut, Haare, Porträt, Aussehen & Biografie, Schätze (Beute), Fortsetzung der Merkmale |
| 3 | Zauberklasse, Attribut, SG, Angriffsbonus, Zauberplätze (gesamt/verbraucht, Paktmagie mit „P“), Zauber pro Grad mit Vorbereitet-Häkchen; (R) = Ritual, (K) = Konzentration |
| 4+ | Anhang: alles, was nicht auf den Bogen passt, plus optionale Beschreibungen |

Texte werden automatisch verkleinert, bis sie ins Feld passen. Was selbst in kleinster Schrift nicht passt, landet im Anhang.

## Eigene PDF-Vorlage

Unter **Moduleinstellungen → PDF-Vorlage** kann ein anderes PDF gewählt werden, solange es die Feldnamen des offiziellen WotC-5E-Bogens verwendet (z. B. eine übersetzte Fassung desselben Bogens).

## Neue Version veröffentlichen

1. In `module.json` `version` erhöhen (z. B. `1.0.1`) und den `download`-Link auf `.../releases/download/v1.0.1/module.zip` anpassen.
2. Alle Moduldateien (`module.json`, `scripts/`, `lib/`, `lang/`, `assets/`, `README.md`) in eine `module.zip` packen – `module.json` muss direkt in der ZIP liegen, nicht in einem Unterordner.
3. Auf GitHub **Releases → Draft a new release**, Tag `v1.0.1`, und `module.json` + `module.zip` als Dateien anhängen.

## Technik

- PDF-Erzeugung im Browser mit [pdf-lib](https://pdf-lib.js.org/) (MIT, mitgeliefert in `lib/`).
- Keine Server-Komponente, keine externen Abhängigkeiten.

## Hinweise

Der Charakterbogen (`assets/character-sheet.pdf`) ist © Wizards of the Coast und laut Fußzeile zur persönlichen Nutzung freigegeben. *Dungeons & Dragons* ist eine Marke von Wizards of the Coast. Dieses Modul ist ein inoffizielles Fan-Projekt.
