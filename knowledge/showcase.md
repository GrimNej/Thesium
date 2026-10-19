# Showcase lessons

What the best public Opus 5.5 films have in common, distilled from the 513 prompts in
[awesome-opus5-5-videos](https://github.com/yihui-dev/awesome-opus5-5-videos) (October 2026).
Most prompts there are one line ("make a dynamic 15-second motion graphics video… go all out").
The films that look professional on the first try came from prompts that read like a production
spec. Your job is to write that spec for yourself in `PLAN.md` before you build.

## The spec-grade brief

The strongest prompts (a Spotify product film, a TanStack AI launch, a photon explainer, a
UI-morph loop) share six parts. Fill each one in `PLAN.md`:

| Part                | What it pins down                                                            | Example                                                                             |
| ------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Art direction       | Stage, palette (3 colours + 1 accent), one font, icon stroke, negative space | "Near-black stage at 80% width; white type, grey secondary, one green for emphasis" |
| Exact timeline      | Every beat with a time range, the exact on-screen words and the motion       | "4.9–5.8 s: search field appears, types ‘Glass Tides’, one result slides in"        |
| Persistent element  | One object that survives cuts and ties shots together                        | A player bar, a cursor, one shape that morphs into every state, the hero artwork    |
| Motion quality      | Easing, overshoot, what is banned                                            | "Critically damped springs, tiny overshoot, no bouncing, no camera shake"           |
| Accuracy guardrails | What the facts allow and forbid                                              | "It is a release candidate, not v1. Do not present planned features as shipped."    |
| Verification        | How you will prove it before delivering                                      | "One frame per beat on a contact sheet; check every handoff frame by frame"         |

## Motion rules that prevent most defects

1. **One text per space.** Outgoing text leaves before incoming text takes the same space. Content
   enters after its container starts to move and leaves before the next move.
2. **Match-position transitions.** The next shot grows out of something in this one: the same
   artwork, shape, colour block or cursor. Avoid arbitrary full-frame crossfades and resets.
3. **Keep the hero's identity.** A recurring image or logo keeps its look and screen relationship
   through every transition it takes part in.
4. **Never fade black straight into the accent colour.** Move an accent element across instead.
5. **Clip to the stage.** Oversized zooms and covers are cropped cleanly by their frame, never spill
   past it or leave empty bands.
6. **Springs, not bounces.** Closed-form critically damped springs or tuned ease curves. When a
   value changes target several times, add one spring per change rather than restarting.
7. **Each transition shows something.** A transition should demonstrate a feature or idea, not
   just swap one title card for the next. The film is not a slideshow of bullets.
8. **About one idea per second** in fast product films; slow down for emotion, then speed up.
9. **Hold the last frame** long enough to read twice. A loop's last frame equals its first.
10. **Restrained motion blur.** 3–6 temporal subframes on fast moves; stationary text stays sharp.

## What great prompts ban

Generic stock footage, spinning logos, fake dashboards, tiny code nobody can read, oversized
presentation headings, particles and lens flares with no reason, shockwave rings, camera shake,
heavy glitch, overlapping text, long blank intervals, a creator watermark or progress counter.

## Using real material

- Break screenshots into components (cards, rows, buttons, icons) and animate those; a raw
  screenshot sliding past is a demo, not a film.
- Simulate the real thing when you can: an actual random walk, a real chart from real numbers,
  typing that matches the product.
- Use only facts and numbers from the sources. Put real UI and real data on screen.

## Sound

- Pick a tempo (about 120 BPM for product films) and cut every scene on the grid. Something
  happens on every beat in fast films.
- Effects sit under the music. The story still works muted, so captions or on-screen words carry
  the message.

## Verify before the master

1. Render one frame per beat (`thesium still` at each section's key moment, or `thesium preview`'s
   sheet) and fix anything cramped, clipped, overlapping or unreadable.
2. Check every transition frame by frame around the cut (`thesium strip <t>`).
3. Ask the critic subagent for fresh eyes.
4. Only then master. One independent review follows the master. A film that needs a second
   round means a defect was visible in your own checks and was missed.
