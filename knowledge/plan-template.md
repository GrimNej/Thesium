# PLAN.md

Write the film before you build it. `BRIEF.md` holds the commission; `PLAN.md` holds your answer
to it, at the level of detail a production team could shoot from. The shape below comes from the
prompts behind the strongest public AI-directed films ([showcase.md](showcase.md)).

```markdown
# Plan: <title>

## Concept
The one line the viewer should remember. Who watches, what they should feel, what they do after.
Benchmark: <a real title sequence, launch film, ad or music video> — learn: … / do not take: …
Three structures considered (single journey, before/after, countdown, one camera move,
one object transforming…) and why this one.

## Art direction
Stage · palette: 3 colours + 1 accent (hex) · type: display + text face, weights, sizes at 1080p ·
texture and light · negative space · what the frame never contains.

## Persistent element and signature move
The one thing that carries across cuts. The one moment only this medium can do.

## Beat grid
BPM, beats per bar, total bars; downbeats of each section; the near-silence before the peak;
the final chord under the end card.

## Shots
| Time | Exact words on screen | Picture and motion | Camera | Sound | Hand-off to next |
| --- | --- | --- | --- | --- | --- |
| 0.0–2.5 | "…" | … | push 3% | low drone, tick per char | the cursor becomes the horizon |

## Motion quality
Eases and spring tiers for this film; motion blur; what it will never do (no bounce, no shake…).

## Sound
Instrumentation per section, SFX on named actions, J/L cuts, the ending.

## Accuracy guardrails
Every fact the copy relies on, with its source. What the facts do not allow.

## Verification
One still per section at its key moment; a strip across every cut; phone-size reading check;
the critic before mastering.
```

Keep `timeline.json` in step with the shot list: its `sections` are the shots' names and start
times (the studio and the critic use them), its `bpm` is the beat grid, its `cues` the hits.
