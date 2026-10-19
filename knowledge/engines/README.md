# Engines

An engine is whatever turns your source into pixels. Thesium needs one thing from it: the frame
at time `t`. Everything else (stills, strips, motion blur, sheets, previews, determinism checks,
mastered sound, QA, the critic, the studio) is Thesium's and identical on every engine. So is the
standard: a film is not allowed to look worse because of the engine it was made in.

| Engine | You write | Strong at | Guide |
| --- | --- | --- | --- |
| `web` | `film/index.html` that sets `window.render(t)` | Anything a browser draws: DOM type, SVG, Canvas, WebGL shaders, Three.js 3D, real media | [web.md](web.md) |
| `effectcraft` | `film/build.jsx`, an After Effects-style script | Layer compositing: 300+ effects (glow, fractal noise, particles, light rays, lens flares), text animators, shape layers, 3D cameras and lights, native motion blur | [effectcraft.md](effectcraft.md) |
| `remotion` | A React project in `film/remotion/` | Long, many-scene films with reusable components | [remotion.md](remotion.md) |
| `hyperframes` | An HTML + GSAP project in `film/hyperframes/` | GSAP-choreographed HTML compositions | [hyperframes.md](hyperframes.md) |
| `command` | Command templates in `thesium.json` | Any renderer with a CLI: Blender, Manim, Motion Canvas, your own | [command.md](command.md) |

## Choosing

The person may name an engine; then that is the engine. Otherwise choose by the look:

- Typography, UI, data, illustration, mixed media, custom shaders, real 3D worlds → **web**.
- Compositing-heavy looks: glows and light, fractal textures, particle systems, layered photos
  with masks and mattes, text animators, AE-style title sequences → **effectcraft**.
- A team already has components in React, or the film is long and modular → **remotion**.

## The contract every engine shares

- `thesium.json` fixes size, fps and duration. The engine's own settings must match; Thesium
  checks.
- Every frame is a pure function of time. `thesium check` renders frames in two orders and fails
  if they differ.
- Offline: render only from files in the film folder, Thesium's fonts and its kit.
- Parameters (`thesium.json` → `params`) are values the person can tune in the studio. Every
  engine receives them: `window.THESIUM.params` (web), `THESIUM.params` / `T.params`
  (EffectCraft), the `thesium` prop (Remotion), `window.THESIUM` from `thesium-params.js`
  (HyperFrames), `{params}` JSON file (command). Expose the few values a person would want to
  adjust (accent colour, title text, pacing) and read them, never copies of them.

## Same craft, different words

| Craft | web | effectcraft | remotion | hyperframes |
| --- | --- | --- | --- | --- |
| A value over time | compute in `render(t)` | `T.key` / `T.anim` / `T.expr` | compute from `useCurrentFrame()` | a tween on the paused timeline |
| Ease out | `ease.outExpo(seg(t, a, b))` | `T.key(l, p, [[a, v0], [b, v1, "expo"]])` | `interpolate(…, {easing: Easing.out(Easing.exp)})` | `ease: "expo.out"` |
| Spring | `spring(t - t0, w, z)` | `T.springTo(l, p, from, to, t0, {feel})` | `spring({frame, fps, config})` | baked tween or custom ease |
| Seeded random | `rand(seed)` | `T.rand(seed)` | `random(seed)` | a seeded function |
| Camera | a world transform or Three.js camera | a camera layer, or a parent null | a wrapper transform | a wrapper transform |
| Motion blur | `motionBlur.samples` | native: `T.film()` + `T.blur(layer)` | `<CameraMotionBlur>` | `motionBlur.samples` |
| Glow / light | CSS shadows, WebGL bloom (`/kit/web/post.js`) | `Glow`, `CC Light Rays`, `CC Light Sweep`, `Lens Flare` | CSS / canvas | CSS / canvas |
| Sound | Thesium mixes `audio/` for every engine | same | same | same |
