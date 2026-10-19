# Reviewing your own film

You can see pixels, so look at them. Review as a strict motion director who did
not make this film. Do not argue for your own work.

## Loop

1. After each shot: `thesium still <t1> <t2> <t3>` at its start, middle and settle. Open the
   images. Check overflow, overlap, hierarchy, subject size, emptiness.
2. After all shots: `thesium preview` renders the whole film at low resolution and writes
   `review/preview-sheet.jpg` (one frame per second), `review/preview-phone.jpg`
   (360 px wide frames), `review/preview.mp4` and the automatic frame check.
3. For fast moments: `thesium strip <t> [--count 12] [--step 1]` writes neighbouring frames in
   one image (default 12 frames, one frame apart). Use it on whips, morphs and transitions.
4. Score every item below 1–10. List the three worst problems with timestamps. Fix
   them, re-render only those seconds, score again. Repeat until every item is ≥ 8
   or further passes stop improving it. Record each round in `review/log.md`.

## Rubric

| Item | What to look for |
| --- | --- |
| Hook | Does the first 2 s grab attention with something specific to this subject? |
| Phone legibility | At 360 px wide, can every word that matters be read? |
| Motion quality | Eases and springs, weight, anticipation; no linear slides, no frozen dead air |
| Change rate | Something new every 2–4 s; a held breath only where intended |
| Composition | Subject large and placed; no accidental empty quadrants or crowding; safe margins |
| Transitions | Every boundary authored on both sides; no blank or black flash frames |
| Source fidelity | Brand colours, fonts, names, dates, venue, URL exactly as sourced |
| Audio-visual sync | Cuts and key actions on beats; SFX on their actions; ending on the downbeat |
| Originality | Nothing from [banned-defaults.md](banned-defaults.md) unless chosen on purpose |

Typical defects: old and new text overlapping during a swap; centred-headline +
gradient default frames; meaningless corner labels; text blurred by scaling;
stutter at a loop seam; a subject drifting off its spotlight; logos on clashing
backgrounds; a final card that does not hold long enough to act on.

## Acceptance checklist

- [ ] Duration, size and frame rate match `thesium.json`; audio declared and present
- [ ] No blank frames, no leftover elements from the previous shot
- [ ] All text inside safe margins, never clipped or covered
- [ ] Recurring elements look the same everywhere they appear
- [ ] Every fact matches the sources; uncertain items listed in `review/log.md`
- [ ] Mix around −14 LUFS, true peak below −1 dBTP (Thesium masters this, but check balance)
- [ ] `thesium check` passes (manifest, engine rules, language, determinism)
