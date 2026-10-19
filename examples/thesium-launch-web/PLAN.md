# Plan: Thesium

## Concept
**"Every frame is a function of time."** The film is built around the one idea Thesium rests on:
a clock, `t`, drives every frame, so the engine underneath can change and the film does not.
Viewers: developers and motion designers who use AI agents. They should leave knowing what Thesium
does (the model directs and sees its frames; any engine renders; people pin notes) and where to
get it.

Benchmark: the precision of Apple and Linear launch films (one idea per beat, light as material,
type that lands on the beat). Learn the pacing and the restraint; take none of their shots.
Structures considered: a feature list (rejected: no turn), one continuous camera move through a
studio (rejected: too long for 30 s), **a clock that keeps running while the world around it
changes** (chosen: it is the product's truth, and it gives a persistent element for free).

## Art direction
- Stage: deep ink with a slow, cold fractal fog; vignette and fine grain throughout.
- Palette: ink `#05070c`, bone `#f3efe6` (type), steel `#8a93a3` (secondary), accent cyan
  `#6fe7f2` for the clock only. Warm sparks (`#ffb347`) are light, never paint.
- Type: Unbounded Black (the name), Space Grotesk Bold/Medium (statements), JetBrains Mono Medium
  (the clock readout and labels). Statements ≥ 72 px; labels ≥ 30 px.
- Never: a centred headline on a gradient with everything fading in; generic floating spheres.

## Persistent element and signature move
- **The playhead:** a hairline cyan vertical line with a mono readout `t = 12.40` that shows the
  film's real time. It is born from a spark, sweeps across statements, wipes scenes in, becomes the
  studio's playhead, and finally underlines the address.
- **Signature move, "Same film":** the playhead sweeps across one title three times; at each pass
  the engine label riding on it changes (web, effectcraft, remotion) while the frame does not move
  a pixel.

## Beat grid
120 BPM, 4/4: a beat every 0.5 s, a bar every 2 s, 15 bars. Kick enters at 4.0. Riser 6.0–8.0
into the reveal; impact on 8.0. Near-silence 24.6–25.0; final chord on 26.0, ringing to 30.

## Shots
| Time | Exact words on screen | Picture and motion | Camera | Sound | Hand-off |
| --- | --- | --- | --- | --- | --- |
| 0.0–3.0 Hook | `t = 0.00` (live) | A cyan spark ignites at centre and stretches into a hairline ruler across the frame; ticks drop onto it on each beat; the readout counts real time | locked, 2% drift in | low drone, tick per beat | the playhead rises from the ruler's left end |
| 3.0–8.0 Premise | "Every frame" / "is a function of time." | Words rise on beats (3.0, 4.0) in steel; fog world fades in; the playhead sweeps across and turns each word bone as it passes | slow push | kick from 4.0, riser 6–8 | 7.5: everything collapses to centre with a radial blur |
| 8.0–12.0 Reveal | "THESIUM" / "a motion studio for frontier models" | The name slams from 240% with radial blur to rest; glow; a light sweep crosses it at 9.0; sparks rise behind; subline reveals by word at 9.2 | settle with a heavy spring | impact on 8.0, shimmer under the sweep | the playhead wipes the frame wall in from the right |
| 12.0–15.0 Sees | "It sees every frame it makes." | Eight real Thesium stills on cards in a curved 3D wall, lit by a spot; the camera dollies across the wall | 3D dolly, motion blur | arp enters | whip: the wall blurs out left |
| 15.0–17.5 Any engine | "Any engine renders it." + WEB / EFFECTCRAFT / REMOTION / HYPERFRAMES / ANY CLI | Engine names change on each beat, centred, liquid displacement pulsing on each change | locked | a click on each name | the last name melts into the studio |
| 17.5–20.0 Notes | "Notes land on the timeline." | The real studio screenshot on a tilted 3D plane; a note pin drops onto its timeline with a spring; the playhead aligns with the studio's | push-in | pin "pop" | cut on 20.0 to black |
| 20.0–25.0 Same film | "SAME FILM." / "The model directs. Any engine renders." | The playhead sweeps the title three times; its label reads web, effectcraft, remotion; the title does not change | locked | three swishes; near-silence 24.6 | the title shrinks into the end lockup |
| 25.0–30.0 End | "THESIUM" / "Any engine. Same film." / "github.com/GrimNej/Thesium" | Lockup settles by 26.5; the playhead lies down and becomes the underline of the address; holds still | still | final chord on 26.0 | held to the last frame |

## Motion quality
Expo-out eases for arrivals, heavy springs for the name, critically damped (no bounce), native
motion blur on everything that moves fast, nothing linear except the clock. Text never scales
into blur at rest. Light moves; type stays crisp.

## Sound
Original score, F♯ minor, 120 BPM: drone pad from 0, ticks on the hook's beats, kick + bass from
4.0, riser into an impact at 8.0, arp from 12.0, clicks on each engine name, a pop for the note
pin, swishes for the three sweeps, a drop to near-silence at 24.6, the final chord at 26.0.

## Accuracy guardrails
Everything on screen is from the repository: the five engines, "notes on the timeline", the
studio, the address. No users, numbers, versions or claims that the README does not make. The
frames on the wall are real Thesium renders.

## Verification
A still per shot at its key moment; strips across 8.0, 12.0, 15.0, 17.5, 20.0, 25.0; phone check
on every statement; preview sheets; the critic before mastering.
