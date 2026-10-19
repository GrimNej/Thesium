# Example: "Thesium", a 30 s launch film on EffectCraft

Made by following the Thesium skill end to end, on the EffectCraft engine: brief → plan →
build shot by shot with stills → score and SFX → check → master → independent review → one
polish pass → master again. Every file the director wrote is here; renders are regenerated.

| File | What it is |
| --- | --- |
| `BRIEF.md` | The commission |
| `PLAN.md` | The spec-grade plan: concept, art direction, persistent element, beat grid, shot table |
| `timeline.json` | Sections, tempo and cues shared by picture, score, studio and critic |
| `film/build.jsx` | The film: an After Effects-style script built by EffectCraft (≈300 lines with the T kit) |
| `audio/score.py`, `audio/sfx.json` | The original score (F♯ minor, 120 BPM) and the SFX timeline |
| `assets/` | Real Thesium renders and the studio screenshot, with `SOURCES.md` |

Rebuild it: `thesium sync` in this folder, then `node thesium.mjs sound score audio/score.py`,
`node thesium.mjs sound sfx`, `node thesium.mjs master`. A compressed copy of the master is at
[`docs/media/thesium-launch-effectcraft.mp4`](../../docs/media/thesium-launch-effectcraft.mp4).

## How it got good

The first build was reviewed shot by shot from stills; the defects found are typical, and so is
the fix for each:

| Found | Fix |
| --- | --- |
| The playhead never appeared | The draw-on wipe held its first key (100% wiped) for the whole film: start with an explicit key at 0 |
| The playhead was horizontal all film | A single rotation keyframe holds forever: key 0° at 0 |
| 13.4 s empty: the wall never showed | The wipe ran the wrong way: Linear Wipe 90° hides from the left, 270° from the right |
| Hook nearly empty, clock unreadable | Labelled ticks, a 64 px clock, and a spark that travels along the ruler and becomes the playhead |
| Light sweep invisible on near-white type | A matted glint plus a breath of glow on the downbeat |
| Wall left dark bands | No stage solid in the wall scene; three rows of cards; varied images per neighbour |
| Words visible before their reveal | A bug in the kit's `T.reveal`, fixed for every EffectCraft film |

The independent review of v1 then found six problems (`review/critic/thesium-v1/critique.md`
when rendered locally): two empty cut frames (20.0 s, 25.0 s), overlapping texts at 17.5 s, thin
secondary type on phones, a faint world at 2–4 s, and a true peak of −0.3 dBTP. One polish pass
fixed all six. The last two led to fixes in Thesium itself: the frame check now tells a fog world
from an empty panel, and mastering measures the encoded true peak (v2: −14.1 LUFS, −1.0 dBTP).

The frame check still flags 1.5–3.5 s as a large dark field. That is intended: the film opens in
darkness with a spark and a ruler of time.

## The same film on the web engine

[`examples/thesium-launch-web`](../thesium-launch-web/) is the same plan, timeline, assets and
score rendered by the web engine (WebGL fog, DOM type, CSS 3D, SVG displacement). See its README
for the side-by-side comparison.
