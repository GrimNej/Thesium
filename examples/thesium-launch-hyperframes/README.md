# Example: the launch film on HyperFrames

The fourth version of [`examples/thesium-launch`](../thesium-launch/): the same plan, timeline,
assets, score and SFX, rendered by [HyperFrames](https://github.com/heygen-com/hyperframes). The
picture code is the web film's ([`thesium-launch-web`](../thesium-launch-web/)), turned into a
module (`film/hyperframes/scene.js`) that any page can mount; this folder mounts it in a
HyperFrames composition and lets HyperFrames drive the clock.

| File | What it is |
| --- | --- |
| `film/hyperframes/index.html` | The composition: root `#film` (1920×1080, 30 s, 30 fps), the scene module, a paused GSAP timeline |
| `film/hyperframes/scene.js` | The web film's picture code as a module: WebGL fog, DOM type, canvas sparks, CSS 3D wall |
| `film/hyperframes/assets/`, `fonts/` | The film's frames and studio screenshot, and the three fonts it uses |
| `audio/score.py`, `audio/sfx.json` | The same score and SFX as every version of this film |

## How the clock works here

HyperFrames seeks a paused GSAP timeline. This one holds a single linear tween of a clock object
whose setter draws that time, so seeking the timeline to *t* draws frame *t*. The scene loads its
fonts and images first and registers the promise in `window.__hf.buildReady`, so HyperFrames waits
before its first capture; an `hf-seek` listener draws too, and a guard skips a time already drawn.

## Numbers

| Measure | Result |
| --- | --- |
| Master | `out/thesium-hyperframes-v2.mp4`: 1920×1080, 30 s, with sound; technical QA pass; 765 s on one Windows machine (RX 6700 XT) |
| Sound | −14.1 LUFS, −1.0 dBTP (the same mix as the other versions) |
| Motion blur | 8 sub-frames per frame (HyperFrames' 240 fps ceiling), 4 averaged inside the 180° shutter |
| Against the web master | 28.0 dB PSNR on average; see below |

The frames match the web film's: same layout, timing and type. They are not bit-identical, because
the fog shader hashes noise with `sin()`, whose low bits differ between GPU drivers, and the grain
over it amplifies that; still frames and moving frames differ by the same amount, so it is texture,
not timing.

## What making it taught Thesium

- A HyperFrames master with motion blur was 7,200 PNG sub-frames, about 60 GB of temporary space,
  and failed. Thesium now asks HyperFrames for one near-lossless video at the sub-frame rate and
  checks free space before any image sequence.
- The first snapshots were blank: the page threw an error (the web film declares its own `url`
  constant), and snapshots do not report page errors. `thesium check` now runs
  `hyperframes check`, whose runtime errors fail the check.
- The parity sheet showed ghosted readouts here and on Remotion, which led to the motion-blur fix
  for native sequences (see the [blueprint](../../docs/BLUEPRINT.md#7-rendering-services)).
