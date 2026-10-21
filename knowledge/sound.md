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
4. **Narration**, when the brief wants a voice: a script of timed lines spoken locally,
   `thesium sound voice audio/voice.json`. See Narration below.

Declare what you made in `thesium.json` → `audio` (`music`, `sfx`, `voice`, `gains`, `duck`).
Thesium masters it to −14 LUFS integrated, −1 dBTP, AAC 48 kHz, whatever the engine.

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

## Narration

Only when the brief asks for a voice, or the film needs words the picture cannot carry. A film
that reads well on mute should stay on mute.

`audio/voice.json`:

```json
{ "voice": "af_heart", "speed": 1.0,
  "lines": [
    { "t": 1.2, "text": "Every frame is a function of time." },
    { "t": 4.0, "text": "Thesium sees every frame it makes.", "say": "Theezium sees every frame it makes." },
    { "t": 9.5, "text": "Made by hand.", "file": "assets/vo/take-3.wav" } ] }
```

- `t` is when the line starts on the film's clock. `text` is what is said and what the hearing
  check expects; `say` respells it for pronunciation; `file` uses a recorded take instead.
  `voice`, `speed`, `lang` and `gain` (dB) work for the whole script or per line.
- Providers: `"kokoro"` (default; Kokoro-82M, local, `pip install kokoro-onnx`, the model downloads
  once; where the system Python refuses pip, Thesium uses its own `~/.thesium/venv` and its
  messages give the command), `"system"` (the operating system's voice, for a temp track: SAPI,
  `say`, or espeak-ng on Linux), or `"command"` with
  `"command": "piper -m voice.onnx -f \"{out}\""` for any text-to-speech CLI (text on stdin and in
  `{textFile}`; also `{voice}`, `{speed}`, `{lang}`). Quote paths in templates.
- Kokoro voices (`thesium sound voices`): `af_heart`, `af_bella`, `af_nicole`, `am_michael`,
  `am_fenrir`, `am_puck` (American); `bf_emma`, `bf_isabella`, `bm_george`, `bm_fable` (British);
  `ef_dora` (Spanish), `ff_siwis` (French), `if_sara` (Italian), `pf_dora` (Brazilian Portuguese).
  Measured with the hearing check, these come back at 92–100% of words. Kokoro's Hindi (64%),
  Japanese (18%) and Mandarin (33%) voices are not usable through kokoro-onnx: use
  `"provider": "system"` or a `"command"` with a native voice for those languages.
- Every line is cached by what shapes it, so changing one line re-speaks only that line.

What `sound voice` gives back, and what to do with it:

- **Line timings** in `audio/voice.timeline.json` (start and end of every line as spoken). Put
  them into `timeline.json` cues so captions, cuts and hits land on the words.
- **Problems**: a line that runs into the next, past the film's end, or faster than about 3.4
  words a second (narration reads well at 2.3–3).
- **The hearing check** (with `pip install faster-whisper`): the narration is transcribed and
  compared with the script, word by word. A word that is heard as something else is shown with
  how Kokoro pronounced it (`thesium /θˈiːziəm/`), so you can judge the sound from text and
  respell it in `say` if it is wrong. Whisper does not know invented names; a second pass is told
  the capitalised words it missed, as a viewer who reads them on screen would know them.

Writing for the ear: short sentences, one idea each; say what the picture cannot (why, not what);
leave the big visual hits without words; let the music breathe between lines; end on the
product's name or the call to action, not on a subordinate clause.

**The mix.** Narration is levelled to −16 LUFS. With `"duck": "auto"` (the default) the music
dips under every phrase just enough for the voice to sit 10 LU above it, easing in 0.2 s before
the voice and out over 0.35 s after; a number fixes the dip in dB, `0` turns it off. The master's
QA measures the voice against the music while it speaks (it fails under 6 LU) and transcribes the
delivered mix, so a voice buried under the music or a missing line fails QA. Whisper hears speech
through music that people find too loud, which is why the balance is measured as well.

## Check what you cannot hear

`thesium sound check audio/score.wav` prints integrated loudness, true peak and low/mid balance
and writes waveform and spectrum images to `review/`. Look for clipping, unintended silence,
low-end rumble, SFX burying the music, and cues that miss the beat grid.

## Timeline as the single source of truth

Keep sections, tempo and hit points in `timeline.json` at the film's root, read by both the
picture (`timeline()` in the web kit, `T.timeline()` in the EffectCraft kit) and your score
script. Then the picture lands exactly on the music, and a later tempo change moves both.
