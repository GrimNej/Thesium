# Example: the launch film on Remotion

The launch film rendered by [Remotion](https://www.remotion.dev): the same plan, timeline, assets,
score and SFX as [`examples/thesium-launch`](../thesium-launch/), and the web film's picture code
(`film/remotion/src/scene.js`, shared with the HyperFrames version) mounted in a React component.

| File | What it is |
| --- | --- |
| `film/remotion/src/index.tsx` | The composition `Film`: 1920×1080, 30 s; its frame rate comes from `thesium.renderFps` when Thesium renders motion-blur sub-frames |
| `film/remotion/src/Film.tsx` | Mounts the scene once, holds Remotion with `delayRender` until fonts and images are ready, and draws `frame / fps` on every frame |
| `film/remotion/src/scene.js`, `motion.js` | The picture code and Thesium's motion kit |
| `film/remotion/public/` | The film's frames, studio screenshot and fonts |

Rebuild it: `npm install` in `film/remotion`, then `thesium sync` here, `node thesium.mjs sound
score audio/score.py`, `node thesium.mjs sound sfx`, `node thesium.mjs master`.

## Numbers

| Measure | Result |
| --- | --- |
| Master | `out/thesium-remotion-v2.mp4`: 1920×1080, 30 s, with sound; technical QA pass; 1,737 s on one Windows machine (14,400 sub-frames) |
| Sound | −14.1 LUFS, −1.0 dBTP |
| Motion blur | 16 sub-frames per frame (composition at 480 fps), 8 averaged inside the 180° shutter, like the web film |
| Against the web master | 33.4 dB PSNR on average |

As with HyperFrames, the frames match the web film's in layout, timing and type; the difference is
the fog shader's `sin()`-hashed noise, which varies between GPU drivers.

## What making it taught Thesium

- Remotion bundles a project on every `remotion still` call (about 12 s each here). Thesium now
  bundles once per state of the sources and renders stills from the bundle: three stills went from
  41 s to about 5 s.
- Motion blur needs exact sub-frame times. Remotion counts whole frames, so Thesium raises the
  composition's frame rate through an input prop instead; a film that derives time as
  `frame / fps` gets the sub-frames without changing.
- A 30 s master with motion blur is thousands of frames: Remotion sequences are JPEG at quality 95,
  and Thesium checks free space first.
