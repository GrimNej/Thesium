# Craft

The vocabulary of motion, independent of the engine. Each engine guide in [engines/](engines/README.md)
shows how to say these things in that engine; the words and the standard stay the same.

## Time is the only input

Thesium renders any frame, in any order, any number of times (single stills, parallel chunks,
motion-blur samples, a reviewer jumping around). So the picture at time `t` may depend on `t`
and nothing else:

- No wall clocks, timers, free-running loops or playback. No state carried from the previous frame.
- Seeded randomness only (`rand(seed)` in every kit), or a hash of an index.
- Simulations either have closed forms or re-run from 0 to `t` with a fixed step (cache by step).
- Hand-made jitter changes on a grid: seed with `floor(t * 12)` for a drawn 12 fps feel while
  the camera stays smooth.

`thesium check` renders frames in two orders and fails if they differ.

## Easing and springs

Linear motion looks mechanical. Use eases for most moves and springs for physical ones. Every
kit has the same names: `ease.out`, `ease.inOut`, `ease.outExpo`, `ease.snap` (the precise
Swiss "print" ease), `ease.emphasized`, `spring(x, w, z)`, `seg`, `lerp`, `rand`, `noise`.

A closed-form spring depends only on time since its target changed:

```js
function spring(x, w = 16, z = 0.72) {      // x = seconds since the target changed
  if (x <= 0) return 0;
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * x) * (Math.cos(wd * x) + (z * w / wd) * Math.sin(wd * x));
}
// A value that changes target many times: v(t) = v0 + Σ (v_i − v_{i−1}) · spring(t − t_i)
```

| Use | Feel | w | z |
| --- | --- | --- | --- |
| Buttons, toggles, leading edges | quick, crisp | 22–26 | 0.75–0.85 |
| Cards, containers, camera | default | 14–16 | 0.70–0.75 |
| Big type, 3D objects, logo lockups | heavy, barely overshoots | 9–11 | 0.85–1.0 |
| Mascots, stickers | playful | 16–20 | 0.40–0.50 |

Use one tier per element class across the film. A stretchy indicator: drive its two edges with
different springs so the leading edge runs ahead. Keyframe engines get the same feel two ways:
named ease influences between keys, or the curve baked to one key per frame (see the guide).

## Beat grid

Seconds per beat = `60 / BPM`. Put state changes on beats, the biggest changes on downbeats (bar
starts), SFX on hits. Start a move one note value early so it **lands** on the beat. The film's
`timeline.json` holds tempo, sections and cues; picture and sound read the same numbers, so a
tempo change moves both. `thesium sound beats <file>` measures a supplied track.

## Motion blur

Fast moves look premium with blur and cheap without it.

- Engines with native motion blur (EffectCraft, After Effects-style layers) use it: shutter 180°.
- Everywhere else, `motionBlur.samples` in thesium.json averages that many renders across the
  shutter for every frame. 2–4 for gentle moves, 8–12 for whips and fly-throughs; render time
  scales with samples.
- Too few samples on a very fast move show as discrete echoes, not blur. If a move covers more
  than about a tenth of the frame per frame, shorten the shutter or slow the move.
- `thesium still` shows the master's blur; `--sharp` turns it off for layout checks. Check the
  fastest moment with `thesium strip` before mastering.

## Camera

Treat the frame as a camera onto a larger world: one camera transform applied to the whole
scene, or a real 3D camera. Push, pull, track, whip-pan, dolly zoom, orbit, rack focus. The
camera is almost never perfectly still; a 1–3% drift keeps a frame alive.

## Typography

- One display face and one text face at most. Bundled OFL families: Inter, Manrope, Space
  Grotesk, Unbounded, Bebas Neue, Fraunces, Instrument Serif, JetBrains Mono (`thesium fonts`).
  Supplied brand fonts in `assets/fonts/` take precedence.
- Big and few. One statement per screen. At 1080p, headline cap height ≥ 70 px, body ≥ 32 px;
  check at 360 px wide with `thesium still <t> --phone`.
- Kinetic type moves as units: per line or per word, clipped from the baseline; per letter only
  for a reason. Track tight (−1% to −3%) at display sizes; wide tracking is for small caps labels.
- Text that swaps inside a moving container needs its own enter and exit, or old and new overlap.
- Wait for fonts before the first frame; check that the font really rendered (a fallback face is
  a defect).
- Know your faces: Unbounded's E has a pointed spine that nests against H; at wide tracking it can
  read as a collision. Choose it on purpose.

## Transitions that grow from content

Match cut on shape or colour; a line that becomes the next horizon; a mask that is the next
scene's subject; a whip pan with blur; a zoom through a letter or a window; a grid that re-flows;
a photo that splits into strips; a 3D object the camera flies through; light that floods to white
and resolves into the next scene. Plan both sides of every boundary.

## Density

Something new every 2–4 seconds, yet one focal point at a time. When the hero moves hard,
support and ambient motion yield. Fill the frame: a subject at least a third of the frame height,
generous but intentional negative space.

## Layout for any shape

Lay out from the frame size, never hard-coded positions copied from another shape. Each aspect
(16:9, 9:16, 1:1) gets its own composition decisions, not a crop.

## Texture

Grain, halftone, scanlines, paper and noise make digital frames feel made. Keep it subtle under
text. Light is a material too: glows, light sweeps, bloom and rays give depth when they have a
source and a reason.

## Gotchas everywhere

- Confirm one still shows an effect working before relying on it.
- Loops: the last frame equals the first, including positions and velocities.
- Long films: render a low-res preview first; refine after rhythm and transitions work.
