# Engine: effectcraft

[EffectCraft](https://github.com/storytold/effectcraft) is a clean-room After Effects in Rust:
compositions, layers, keyframes, 300+ effects, text animators, shape layers, 3D cameras and lights,
native motion blur. In Thesium the film is a **build script**, `film/build.jsx`, written in the
After Effects scripting dialect. Every render runs it headless into a project, then renders frames
from that project. The script is the film's source: rebuild it any time, diff it, tune it.

Everything below was verified by rendering on EffectCraft 0.11.1.

## Contract

```js
// film/build.jsx
var comp = T.film({ background: "#05060a" });   // THE comp: size, fps, duration from thesium.json

var title = T.text("LAUNCH", { font: "Unbounded", style: "Black", size: 200, fill: "#f3f0e8" });
T.reveal(title, 0.6, { by: "chars", duration: 1.1, from: { y: 90, opacity: 0, blur: 24 } });
T.glow(title, { threshold: 60, radius: 60, intensity: 0.9 });
```

- `THESIUM` holds `width`, `height`, `fps`, `duration`, `params`, `root`. `T.params` are the tunables.
- The kit (`kit/effectcraft/thesium.jsx`) is included first; plain EffectCraft scripting works too:
  `app.run(commandId, params)` for any of ~730 engine commands, and the AE object model
  (`app.project`, `comp.layers`, `layer.property(...)`, `setValueAtTime`, `sourceRectAtTime`…).
- `thesium build` runs the script and **fails** if the comp named `Film` is missing, its size, fps or
  duration differ from thesium.json, or any text layer's font does not resolve.
- Deterministic by construction: keyframes and expressions. Never `Math.random` (use `T.rand(seed)`
  or `seedRandom` in expressions), `Date`, scheduled tasks, sockets, absolute paths.
- Files: only from the film folder: `T.image("assets/photo.jpg")`, `T.footage(...)`, `T.asset(...)`.
- Fonts: family + style from `thesium fonts` (bundled: Inter, Manrope, Space Grotesk, Unbounded,
  Bebas Neue, Fraunces, Instrument Serif, JetBrains Mono; brand fonts in `assets/fonts/`).
  Never PostScript names: EffectCraft falls back to Inter silently.
- Effects and their exact parameter ids: `thesium effects <name>`. Point parameters are in
  **comp pixels** even though the listed defaults look like fractions.

## The T kit

| Area | Functions |
| --- | --- |
| Comps | `T.film(o)`, `T.scene(name, start, duration, build, o)` (a precomp placed at `start`, local time from 0), `T.within(comp, fn)` |
| Layers | `T.solid(color, o)`, `T.text(str, o)`, `T.shape(kind, o)`, `T.shapeItem(layer, kind)`, `T.image(path, o)`, `T.nul(name)`, `T.adjustment(name)`, `T.camera(o)`, `T.light(o)` |
| Common layer options | `position`, `anchor`, `scale`, `rotation`, `opacity`, `blend`, `in`, `out`, `blur` (motion blur), `threeD`, `parent`, `name` |
| Text options | `font`, `style`, `size`, `fill`, `tracking`, `leading`, `justify`, `box`, `stroke`, `strokeWidth`, `allCaps`, `anchorAt` (`center` default, `left`, `right`, `baseline`) |
| Animation | `T.key(layer, path, [[t, v], [t, v, feel]…], feel)`, `T.anim(layer, path, fn, t0, t1)` (bakes any curve), `T.springTo(layer, path, from, to, t0, {feel})`, `T.expr(layer, path, code)` |
| Feels for `T.key` | `out` (default), `in`, `inOut`, `smooth`, `expo`, `inExpo`, `snap`, `heavy`, `gentle`, `linear`, `hold` |
| Effects | `T.fx(layer, name, values)` → base path such as `effects/#2`; `T.glow(layer, o)`; `T.style(layer, kind)` (layer styles) |
| Text motion | `T.reveal(layer, t0, {by: chars|words|lines, duration, from: {x, y, opacity, blur, scale, rotation, tracking}, smoothness, feel})` |
| Switches | `T.blur(layer)`, `T.three(layer)`, `T.blend(layer, mode)`, `T.matte(layer, matteLayer, kind)`, `T.span(layer, in, out)` |
| Values | `T.set(layer, path, value)`, `T.get(layer, path, t)` |
| Maths (same as the web kit) | `T.ease.*`, `T.spring`, `T.seg`, `T.lerp`, `T.env`, `T.rand`, `T.noise`, `T.hex`, `T.rgb` |
| Clock | `T.timeline()` → `bpm`, `sections`, `beat(n)`, `bar(n)`, `section(name)` from timeline.json |

Property paths are EffectCraft's: `transform/position`, `transform/scale`, `transform/rotation`,
`transform/opacity`, `transform/anchor`, `transform/orientation`, `transform/rotationX|Y`,
`effects/#2/radius`, `contents/trim/end`, `contents/group/contents/stroke/color`,
`text/animators/animator/selectors/rangeSelector/start`, `materialOptions/castsShadows`; cameras and
lights: `transform/poi`, `cameraOptions/zoom|dof|focusDistance|aperture`,
`lightOptions/intensity|color|coneAngle|castsShadows|shadowDiffusion`.
`thesium build` errors name the bad path; `effectcraft-cli props <comp> <layer> --flat` lists them.

## Craft in EffectCraft terms

- **Ease and springs**: `T.key` feels are bezier influences (an `expo` move is 86% done at half
  time). For true springs or overshoot, `T.springTo` bakes the closed-form spring per frame.
- **Camera**: a 3D camera (`T.camera`) with `T.three` layers, or a 2D rig: parent everything to a
  `T.nul("Rig")` and push, drift or whip the rig.
- **Motion blur**: `T.film()` turns on comp motion blur at a 180° shutter; enable it per moving
  layer with `blur: true` / `T.blur(layer)`. Keep `motionBlur.samples` at 1 in thesium.json.
- **Scenes**: build each section as `T.scene(...)` so its timing is local and transitions are layers
  in the parent comp. Name scenes after timeline.json sections.
- **Type**: `T.text` centres on the glyphs' visual bounds; reveal with `T.reveal` (chars for titles,
  words for lines, lines for paragraphs). Big and few; check `thesium still <t> --phone`.

## Recipes that work

| Look | How |
| --- | --- |
| Glowing title | `T.glow(title, {threshold: 55–70, radius: 40–70, intensity: 0.6–1.2})`; more intensity blows out |
| Living fog / texture world | Solid + `Fractal Noise` `{fractalType: 1, contrast: 140, brightness: -38, "transform/scale": 420, complexity: 5}`, `T.expr(fog, fx + "/evolution", "time * 24")`, then `Tint {black, white}` to colour it |
| Line that draws itself | `T.shape("ellipse", {fill: false, stroke, strokeWidth})`, `trim = T.shapeItem(ring, "trim")`, `T.key(ring, trim + "/end", [[t0, 0], [t1, 100, "expo"]])` |
| Per-character reveal | `T.reveal(title, t0, {by: "chars", from: {y: 90, opacity: 0, blur: 24}})` |
| Push-in that settles | Parent layers to a null; `T.springTo(rig, "transform/scale", [92,92,100], [100,100,100], t0, {feel: "heavy"})`, then a slow linear drift |
| Lens flare | Black solid + `Lens Flare {flareBrightness: 100–130, lensType: 2}` keyed `flareCenter`, blend `Screen` |
| 3D cards with real light | Shape layers with `T.three`, `materialOptions/castsShadows: 1`, a floor solid rotated 90° on X accepting shadows, a Spot light with shadows plus a weak Ambient, a 35mm camera keyed with `inOut` |
| Liquid type | `Turbulent Displace {displacement: 3, amount: 35, size: 120, complexity: 2}` + `T.expr(t, fx + "/evolution", "time * 120")` |
| Rich gradient world | Solid + `4-Color Gradient` (dark, related colours, `blend: 300`, a point moving by expression), an adjustment layer with `CC Vignette {amount: 60}` and `Add Grain {preset: 1, "tweaking/intensity": 0.6}` |
| Impact slam | Scale keyed 260% → 100% with `expo`, plus `CC Radial Fast Blur {amount}` keyed 90 → 0 over the same span |
| Embers, dust, sparks | Many tiny shape layers with position expressions: `seedRandom(i, true); var sp = random(60, 220); …` (deterministic), an adjustment layer with Glow on top |
| Light passing over metal type | `CC Light Sweep {direction: -25, width: 60–90, sweepIntensity: 200+, edgeIntensity: 250+}` with `center` keyed across |
| Trails | `Echo {echoTime: -0.03, numberOfEchoes: 12}` on a **precomp** (scene) layer |

## Recipes from the showcase film (`examples/thesium-launch`)

| Look | How |
| --- | --- |
| A live clock on screen | `T.expr(text, "text/sourceText", '"t = " + time.toFixed(2)')` |
| A label that sizes itself | A `rounded` shape whose `contents/group/contents/rect/size` expression reads `thisComp.layer("Label").sourceRectAtTime(time, false)`; position both from the element they ride on |
| A line that wipes scenes | `Linear Wipe` on the incoming layer with `completion` keyed in step with the line's x: angle 90 hides from the left (`completion = x / W × 100` shows what is right of the line), angle 270 hides from the right (`100 − x / W × 100` shows what is left of it). Text and shape layers' wipe bounds are comp-wide, centred on the layer |
| A glint inside letters | A blurred white bar (`blend: "Add"`) under a copy of the title, `T.matte(bar, copy, "alpha")`. Subtle on near-white type; give the type a little headroom (`#dcd8cf`) |
| A breath of light | Key the title's Glow `intensity` 0.75 → 1.5 → 0.75 on a downbeat |
| A slam into a cut | Scale 175–250% → 100% with `expo` over 0.5 s, opacity 0 → 100 in 0.08 s, on the downbeat |
| A curved wall of images | Image layers `T.three`, scale ~30%, columns spread on x with `rotationY` and z growing towards the edges, a Spot plus Ambient light, a camera dolly; no stage solid so the world shows behind |

## Gotchas learned the hard way

- **One keyframe holds forever.** `T.key(l, p, [[25.6, 90, "hold"]])` sets 90 for the whole film. Start
  with an explicit key at 0: `[[0, 0], [25.6, 90, "hold"]]`. The same applies to effect parameters
  you only want to change late.
- **Thin lines and motion blur.** A 3–4 px line moving fast smears into near-invisibility at a 180°
  shutter. Leave motion blur off on precise, thin instruments (playheads, rules, cursors).
- **Track mattes need the matte above.** Create the matte copy after the layer it mattes.
- **Text reveals** (`T.reveal`) slide a ramp across the text with `offset`, so the text is fully hidden
  before `t0` and fully at rest after `t0 + duration`. Put a layer's `in` a little before `t0`.
- **Scenes change the active comp.** Use `T.scene`/`T.within` rather than `app.project.items.addComp`
  directly, or new layers land in the wrong comp.
- **Camera and light paths** are `transform/poi`, `cameraOptions/*`, `lightOptions/*` (not
  `pointOfInterest`).

## Avoid on 0.11.1

These rendered nothing useful in testing; use the recipes above instead: `CC Particle World`
(nothing visible, even pre-rolled), `CC Light Rays` (blown out or invisible), `CC Star Burst`
(invisible), `Echo` directly on a shape layer (no trail), a Brightest `CC Radial Fast Blur`
duplicate as god rays (hard blocky streaks). Variable fonts draw at their default weight: Thesium
gives EffectCraft fixed-weight instances, so always name the `style`.

## Performance

A 1080p frame takes 75–400 ms on the CPU depending on effects. Renders already use every core;
previews render at half resolution (about 3.7× faster). Heavy effects (Fractal Noise at full
frame, big glows) dominate: keep them on few layers and reuse a scene instead of duplicating.

## Checking

`thesium build` (script errors, comp settings, fonts) → `thesium still <t…>` → `thesium strip <t>`
across cuts → `thesium preview` → `thesium check` (also renders frames in two orders) →
`thesium master`. The master renders a lossless PNG sequence and encodes it with the same
pipeline as every other engine.
