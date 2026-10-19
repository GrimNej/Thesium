# Sound

Sound is half the film. You cannot hear, so you design sound on the timeline and
check it with numbers and pictures.

## Sources, in order of preference

1. **Music the person supplied** (`assets/` audio). Measure it: `thesium sound beats assets/<file>`
   → `audio/beats.json` (bpm, beats, downbeats, hits). Cut to it.
2. **An original score you write** with `kit/audio/synth.py` (numpy/scipy, offline): write
   `audio/score.py`, run `thesium sound score audio/score.py`. Compose from the cue map: tempo,
   bars, sections, instrumentation per section.
3. **SFX** you place on the exact frames of visual actions: `thesium sound sfx audio/sfx.json`.

Declare what you made in `thesium.json` → `audio` (`music`, `sfx`, `voice`, `gains`). Thesium
masters it to −14 LUFS integrated, −1 dBTP, AAC 48 kHz, whatever the engine.

## Writing a score with `kit/audio/synth.py`

```python
from synth import Song   # the kit is on the path when run through `thesium sound score`
song = Song(bpm=124, bars=31, key='F#m', seed=7)
song.drums('A', bars=(0, 8), pattern='four_on_floor', fills=True)
song.bass('A', bars=(4, 16), progression=['i', 'VI', 'III', 'VII'], style='offbeat')
song.pad('A', bars=(0, 31), progression=['i', 'VI', 'III', 'VII'], brightness=0.4)
song.arp('B', bars=(8, 24), progression=['i', 'VI', 'III', 'VII'], rate=16, octave=5)
song.riser(at_bar=15, length_bars=1); song.impact(at_bar=16)
song.drop(bars=(23, 24))                      # silence before the payoff
song.render('audio/score.wav', stems='audio/stems')
```

Read the docstrings in `kit/audio/synth.py` for every instrument (kick, snare, clap,
hats, toms, sub/808 bass, saw/square leads, supersaw, FM bells, plucks, pads,
noise risers, impacts, downlifters, tape stops), effects (reverb, delay,
sidechain, filter sweeps, saturation) and arrangement helpers. You may also write
any numpy synthesis yourself.

**Score craft:**

- Structure the music like the film: intro → build → drop/peak → breakdown → final lift → button ending.
- At least one real silence or near-silence before the peak; the first sound after it should be one of the most important sounds in the film.
- Bass speaks on phones: give it 2nd and 3rd harmonics; keep 20–120 Hz about −3 dB relative to the mids.
- Avoid generic "piano and strings"; choose instruments from the film's world (synthwave for neon tech, marimba and claps for playful product, taiko and brass stabs for epic, glitch percussion for cyber, warm keys for human stories).
- End on a downbeat with a tail (reverb or a held chord), timed to the final card.

## SFX

Every visible action can have a sound: whooshes on whips, ticks on counters,
clicks on UI, impacts on reveals, risers into drops, shimmer on logo lockups.
Keep them subordinate to the music (−6 to −12 dB relative). Use sound as a
transition at least twice: let the next scene's sound start early (J-cut) or the
previous scene's sound run over the cut (L-cut).

`audio/sfx.json`:

```json
{ "duration": 60, "events": [
  { "t": 0.0, "sound": "impact", "gain": 0.9 },
  { "t": 3.95, "sound": "whoosh", "gain": 0.6, "length": 0.5 },
  { "t": 12.0, "sound": "riser", "length": 2.0 },
  { "t": 14.0, "sound": "boom" } ] }
```

Sounds: `impact boom hit whoosh swish riser downlifter click tick pop blip glitch
shimmer sparkle type snap thump`. Each accepts `gain`, `pitch`, `length`, `pan`.

## Check what you cannot hear

`thesium sound check audio/score.wav` prints integrated loudness, true peak and low/mid balance
and writes waveform and spectrum images to `review/`. Look for clipping, unintended silence,
low-end rumble, SFX burying the music, and cues that miss the beat grid.

## Timeline as the single source of truth

Keep sections, tempo and hit points in `timeline.json` at the film's root, read by both the
picture (`timeline()` in the web kit, `T.timeline()` in the EffectCraft kit) and your score
script. Then the picture lands exactly on the music, and a later tempo change moves both.
