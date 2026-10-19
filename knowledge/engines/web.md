# Engine: web

Any page that draws the frame for a time. Thesium serves the film folder on a loopback server,
opens `film/index.html` in headless Chrome at the film's exact size, waits for `window.ready`,
then calls `await window.render(t)` for every frame it needs and captures the viewport.

## Contract

```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<style>
  @font-face { font-family: 'Unbounded'; src: url('/thesium/fonts/Unbounded.ttf'); font-weight: 200 900; }
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }
</style>
</head><body>
<div id="stage"></div>
<script type="module">
import { ease, seg, spring, rand, timeline } from '/kit/web/motion.js';
const { width, height, duration, params } = window.THESIUM;   // set by Thesium
const tl = await timeline();                                  // timeline.json: sections, bpm, cues

// …build the scene graph once…
await document.fonts.ready;

window.render = (t) => {   // t in seconds; may be async (return a promise)
  // derive EVERYTHING from t
};
window.ready = true;
</script></body></html>
```

- The viewport is the output size: read `width`/`height` from `window.THESIUM` (or `innerWidth`).
- `render(t)` may return a promise (for images or video frames loaded on demand).
- URLs are workspace-absolute: `/assets/…`, `/kit/web/…`, `/film/…`, `/timeline.json`,
  `/thesium/fonts/<file>` (the bundled fonts), `/vendor/<library>/…`.
- Every request outside the loopback server is blocked while rendering. `thesium check` also
  rejects `Math.random`, `Date.now`, timers, `requestAnimationFrame` loops, `setAnimationLoop`,
  remote URLs, CSS animations/transitions and `<video>.play()`.

## The kit (`/kit/web/`)

| Module | Gives you |
| --- | --- |
| `motion.js` | `ease.*` (`out`, `inOut`, `outExpo`, `snap`, `emphasized`, `bezier`…), closed-form `spring`, `springTo`, `track` keyframes, `seg`, `env`, `stagger`, `rand(seed)`, `hash`, `noise`, `noise2`, `fbm`, `boil`, `beatGrid`, `camera2d`, `splitWords`, `film()`, `params()`, `timeline()`, `frameTime(t)` |
| `media.js` | `image(src)`, `images([...])`, `frames(dir)` frame-accurate video (`.at(t)`), `drawCover(ctx, img, x, y, w, h, {fx, fy, zoom})` |
| `post.js` | `createPost(canvas)`: WebGL2 pass over any canvas: grain, vignette, chromatic aberration, CRT curvature, scanlines, bloom, halftone, flash, light leak, warp, exposure, saturation, contrast, tint |

Video clips: `thesium frames assets/clip.mp4 [--fps 30] [--key green]` extracts a frame sequence
to `assets/frames/<name>/`; draw it with `const clip = await frames('/assets/frames/<name>')`
and `await clip.at(t - start)` inside `render(t)`.

## Libraries

`thesium add three` (or `gsap`, `p5`, optionally `@version`) fetches the library once into
`~/.thesium/vendor`, pins the version in `thesium.json`, and serves it at `/vendor/<name>/` with an
import map, so `import * as THREE from 'three'` and `'three/addons/…'` just work, offline.

- **Three.js**: build the scene once; inside `render(t)` set every transform from `t` and call
  `renderer.render(scene, camera)`. Create the renderer with `preserveDrawingBuffer: true` and
  `setPixelRatio(1)`. Never `setAnimationLoop`.
- **GSAP**: build a paused timeline once and call `tl.seek(t, false)` inside `render(t)`.
- **p5**: `noLoop()` in setup; call `redraw()` inside `render(t)` and draw from `t`.

## Stacks: choose the look, then the simplest stack that makes it

| Stack | Strong at | Weak at |
| --- | --- | --- |
| HTML / CSS / SVG | Typography, UI, layout, masks and clip reveals, icon line-draws | Tens of thousands of particles; heavy texture |
| Canvas 2D | Anything drawn stroke by stroke: pixel art, illustration, particles, charts | Lots of crisp text (draw it last, at device size) |
| WebGL shaders | Per-pixel material: grain, halftone, CRT, bloom, liquid distortion, noise fields | Drawing content directly (draw to a canvas, then post-process) |
| Three.js | Real space and camera: dimensional type, product turntables, point clouds, tunnels, low-poly worlds | Photoreal people |
| p5.js | Hand-made feel: pencil, watercolour, crayon, ink | Speed (check one frame first) |

Layer them in one page: a WebGL world at the back, DOM type and photos in the middle, a canvas of
particles or grain on top, all set from the same `t`.

```html
<canvas id="gl"></canvas>   <!-- WebGL world or post pass -->
<div id="dom"></div>        <!-- type, photos, UI, SVG -->
<canvas id="fx"></canvas>   <!-- particles, grain, light leaks -->
```

3D type: load a bundled font with Three.js `FontLoader` (convert with a typeface converter) or
extrude SVG paths; keep the camera's motion on the beat grid.

## Motion blur

`thesium.json` → `motionBlur: { "samples": 4, "shutter": 0.5 }` makes every frame the average of
4 renders across a 180° shutter, in previews (`--blur`), stills and the master. Use 2–4 for
gentle moves, 8–12 for fast camera moves and whips (too few samples show as discrete echoes).
Stationary text stays sharp by construction.

The blur applies to everything that moves. To keep a precise element sharp (a playhead, a cursor,
the digits of a counter), drive it with `frameTime(t)` from `/kit/web/motion.js` instead of `t`:
every sample of a frame then draws it in the same place.

## Performance

Thesium renders in parallel tabs. Build heavy things once (geometry, decoded images, glyph
atlases); keep `render(t)` cheap. Preload frames with `clip.preload()` before `window.ready`.
A preview renders at half scale; the master at full size.

## Gotchas

- Await fonts and images before `window.ready = true`. Check one still for the real font.
- WebGL: confirm one still shows the effect working before relying on it.
- `will-change` and scaled text produce blurry type; scale containers, not glyph bitmaps.
- Canvas sized in CSS pixels must also set its backing size (`canvas.width = width`).
