# Engine: remotion

[Remotion](https://www.remotion.dev) renders React components frame by frame. In Thesium the film
is a Remotion project in `film/remotion/` whose composition id is `Film`. Thesium drives the
project's own Remotion CLI (`remotion still`, `remotion render --sequence`) and bundles none of
Remotion; Remotion's license applies to its use.

## Setup

`thesium new <folder> --engine remotion` writes `package.json`, `src/index.tsx` (registers `Film`
with the size, fps and frame count from thesium.json) and `src/Film.tsx`. Then run `npm install`
in `film/remotion`. `thesium check` reports when Remotion is not installed.

## Contract

```tsx
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing, spring } from 'remotion';

export const Film = ({ thesium }: { thesium: { params: Record<string, unknown> } }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;            // seconds, the same clock as timeline.json
  // derive everything from frame
  return <AbsoluteFill style={{ background: '#000' }} />;
};
```

- Thesium passes the film's facts and tuned parameters as the `thesium` prop.
- Media in `public/`, referenced with `staticFile()`. No remote URLs, no `Math.random` (use
  `random(seed)` from `remotion`), no timers.
- Remotion renders whole frames: use `@remotion/motion-blur` (`<CameraMotionBlur>`) for blur and
  keep `motionBlur.samples` at 1.
- Fonts: copy the bundled files you use from Thesium's `fonts/` into `public/` and load them with
  `@font-face` or `@remotion/fonts`.

## Craft in Remotion terms

`interpolate(frame, [a, b], [v0, v1], { easing: Easing.out(Easing.exp), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })`
is `ease.outExpo(seg(t, a, b))`; `spring({ frame: frame - start, fps, config: { stiffness, damping } })`
is the kit's spring. `<Sequence from={…}>` gives each section local time. Sound still comes from
`audio/` and is mastered by Thesium, so leave `<Audio>` out unless the person asks.

## Status

The driver renders stills one at a time through the CLI (a bundle per call), so stills are slower
than on the web engine; previews and masters render image sequences in one call.
