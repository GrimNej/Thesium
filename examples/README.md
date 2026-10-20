# Examples

Every film here was made with Thesium. Each folder is a complete film: the brief, the plan, the
source, the sound scripts and a making-of README. Masters are not committed; compressed copies of
two of them are in [`docs/media/`](../docs/media/).

| Film | Engine | What it shows |
| --- | --- | --- |
| [**thesium-launch**](thesium-launch/) | EffectCraft | A 30-second launch film made by following the director skill end to end, with an independent review and a polish pass. [Watch](../docs/media/thesium-launch-effectcraft.mp4) |
| [**thesium-launch-web**](thesium-launch-web/) | Web | The same film, written again for the browser: WebGL fog, CSS 3D, SVG filters. Includes the comparison of all four engines. [Watch](../docs/media/thesium-launch-web.mp4) |
| [**thesium-launch-hyperframes**](thesium-launch-hyperframes/) | HyperFrames | The web film's picture code mounted in a HyperFrames composition, driven by its paused GSAP timeline |
| [**thesium-launch-remotion**](thesium-launch-remotion/) | Remotion | The same picture code in a Remotion composition, driven by `useCurrentFrame()` |
| [**thesium-voice**](thesium-voice/) | Web | A 24-second narrated film drawn from Thesium's hearing check of its own voice-over. [Watch](../docs/media/thesium-voice.mp4) |

To rebuild one: run `thesium sync` in its folder, render its sound (`node thesium.mjs sound score
audio/score.py`, `sound sfx`, and `sound voice` where there is a script), then `node thesium.mjs
master`. Remotion films need `npm install` in `film/remotion` first.
