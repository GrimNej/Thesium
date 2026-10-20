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
- Always derive time as `frame / fps` with `fps` from `useVideoConfig()`, never a constant. For
  motion blur (`motionBlur.samples` in thesium.json) Thesium renders extra sub-frames by raising
  the composition's frame rate through `thesium.renderFps`, which the scaffolded `src/index.tsx`
  reads; a film that derives time this way gets exact sub-frame times for free.
- WebGL: if a canvas comes out blank, set `engineOptions.remotion.gl` in thesium.json (`"angle"`,
  `"swangle"`); Thesium passes it to Remotion as `--gl`.
- Fonts: copy the bundled files you use from Thesium's `fonts/` into `public/` and load them with
  `@font-face` or `@remotion/fonts`.

## Craft in Remotion terms

`interpolate(frame, [a, b], [v0, v1], { easing: Easing.out(Easing.exp), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })`
is `ease.outExpo(seg(t, a, b))`; `spring({ frame: frame - start, fps, config: { stiffness, damping } })`
is the kit's spring. `<Sequence from={…}>` gives each section local time. Sound still comes from
`audio/` and is mastered by Thesium, so leave `<Audio>` out unless the person asks.

## Status

Verified with Remotion 4.0.537 (stills, tuned parameters, `check`, `preview`). Thesium bundles the
project once per state of its sources (`remotion bundle` into `.thesium/remotion/<hash>`) and
renders stills from the bundle two at a time (`engineOptions.remotion.parallel`, up to 3), so a
still costs about 2 s instead of a fresh bundle each; previews and masters render image sequences in
one call.
