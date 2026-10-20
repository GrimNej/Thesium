# Engine: hyperframes

[HyperFrames](https://github.com/heygen-com/hyperframes) renders HTML compositions driven by a
paused GSAP timeline. In Thesium the film is a HyperFrames project in `film/hyperframes/`. Thesium
calls the HyperFrames CLI (`snapshot --at` for exact stills, `render` for the whole film) and
bundles none of it.

## Setup

`thesium new <folder> --engine hyperframes` writes `index.html` with the root composition
(`data-composition-id="film"`, `data-width`, `data-height`, `data-duration`, `data-fps` from
thesium.json), a local `gsap.min.js`, and `thesium-params.js`. The CLI comes from a global
`hyperframes` install, `THESIUM_HYPERFRAMES`, or `npx hyperframes@latest`.

## Contract

- The root element's size and duration match thesium.json (`thesium check` verifies them).
- One paused timeline registered at `window.__timelines['film']`; everything animates on it.
  Nothing runs on its own clock: no `requestAnimationFrame` loops, timers or `Math.random`.
- `thesium-params.js` sets `window.THESIUM` (size, timing, tuned `params`) before your scripts;
  Thesium rewrites it for every render, so read params from it.
- All files local to the project folder; no remote resources.
- Three.js inside HyperFrames renders from the `hf-seek` event's time; keep frame-critical work
  synchronous.

## Craft in HyperFrames terms

Eases are GSAP names (`expo.out`, `power3.inOut`); springs are custom eases or tweens baked from the
kit's spring. Sections are labels on the timeline that match timeline.json. Motion blur:
`motionBlur.samples` works on stills and masters; HyperFrames renders at most 240 fps, so a 30 fps
film gets up to 8 sub-frames per frame and averages those inside the shutter.

Canvas or WebGL drawn from code (rather than tweened DOM) renders from the seek time: build the
scene, register it in `window.__hf.buildReady` so HyperFrames waits for it, draw on the `hf-seek`
event, and drive a paused timeline whose tween sets a clock object (its setter draws that time).
`examples/thesium-launch-hyperframes` does exactly this with a 500-line WebGL and DOM scene.

## Checks

`thesium check` runs `hyperframes check` on the composition: its lint and runtime errors (a script
that throws renders blank frames) fail the check, and its layout and contrast findings come back
as warnings. Mark deliberate overlaps (grain, light leaks over type) with
`data-layout-allow-occlusion`.

## Status

Partial-range previews fall back to frame-by-frame snapshots; full renders use one CLI call and
come back as one near-lossless video (no image sequence on disk).
