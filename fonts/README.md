# Fonts

Bundled so films look the same on every machine and every engine. All are licensed under the
SIL Open Font License 1.1; each family's notice is beside it (`OFL-<Family>.txt`).

| File | Family | Axes / styles | Character | Source |
| --- | --- | --- | --- | --- |
| `Inter.ttf` | Inter | weight 100–900, optical size 14–32 | Neutral UI and text grotesk | [rsms/inter](https://github.com/rsms/inter) |
| `Manrope.ttf` | Manrope | weight 200–800 | Friendly geometric text | [googlefonts/manrope](https://github.com/googlefonts/manrope) |
| `SpaceGrotesk.ttf` | Space Grotesk | weight 300–700 | Technical grotesk with quirks | [floriankarsten/space-grotesk](https://github.com/floriankarsten/space-grotesk) |
| `Unbounded.ttf` | Unbounded | weight 200–900 | Wide, round display | [googlefonts/unbounded](https://github.com/googlefonts/unbounded) |
| `BebasNeue-Regular.ttf` | Bebas Neue | Regular | Condensed all-caps display | [dharmatype/Bebas-Neue](https://github.com/dharmatype/Bebas-Neue) |
| `Fraunces.ttf` | Fraunces | weight 100–900, optical size, SOFT, WONK | Expressive editorial serif | [undercasetype/Fraunces](https://github.com/undercasetype/Fraunces) |
| `InstrumentSerif-Regular.ttf`, `-Italic.ttf` | Instrument Serif | Regular, Italic | Elegant condensed display serif | [Instrument/instrument-serif](https://github.com/Instrument/instrument-serif) |
| `JetBrainsMono.ttf` | JetBrains Mono | weight 100–800 | Code and technical labels | [JetBrains/JetBrainsMono](https://github.com/JetBrains/JetBrainsMono) |

Engines reach them differently:

- **web**: `/thesium/fonts/<file>`; declare `@font-face` yourself and `await document.fonts.ready`.
- **effectcraft**: Thesium adds this folder (and the film's `assets/fonts/`) to `EFFECTCRAFT_FONT_DIRS`,
  so the families appear by name in text layers.
- **remotion / hyperframes**: copy the files you use into the project (`thesium fonts copy <dir>`).

Fonts supplied with a brand go in the film's `assets/fonts/` and take precedence.
