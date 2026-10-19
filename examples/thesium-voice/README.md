# Example: "Hears every word", a 24 s narrated film on the web engine

The film for Thesium's narration: the director cannot listen, so Thesium transcribes the
voice-over, checks every word against the script, shows how a misheard name was pronounced, and
lowers the music while the voice speaks. The picture is that check, drawn from its own numbers.

| File | What it is |
| --- | --- |
| `BRIEF.md`, `PLAN.md`, `timeline.json` | The commission, the shot plan, the sections |
| `audio/voice.json` | The narration script: six timed lines for Kokoro `af_heart` |
| `audio/score.py` | The score (D minor, 96 BPM), with a lift where the music steps aside |
| `tools/data.mjs` | Builds `assets/hearing.json` from Thesium's output: envelopes, word times, the check's count, phonemes |
| `film/index.html` | The film: fog shader, lanes through a playhead, captions lit at the moment each word was heard |

Rebuild it: `thesium sync` here, then `node thesium.mjs sound score audio/score.py`,
`node thesium.mjs sound voice`, `node tools/data.mjs`, `node thesium.mjs master`. Narration needs
`pip install kokoro-onnx faster-whisper`. A compressed copy is at
[`docs/media/thesium-voice.mp4`](../../docs/media/thesium-voice.mp4).

## What the tools reported

`sound voice`, first take of the script:

```
  0.70–3.96 s  "A model that makes films can't hear its own voice-over."
  4.80–8.00 s  "So Thesium writes down what was said, and reads it back."
  ...
Problems:
  - Line at 4.8 s is fast (3.4 words/s): cut words or lower its speed
  - Line at 12.4 s is fast (3.6 words/s): cut words or lower its speed
Heard 100% of 54 words (Whisper small)
```

Those two lines went to speed 0.84 and only they were spoken again (the others came from the
cache). The master:

```
out/hears-every-word-v1.mp4 (1920×1080, 24 s, with sound; 61 s)
Technical QA: pass
Narration in the mix: 10 LU above the music while it speaks (music dips 11.2 dB, auto); 100% of 54 words heard (Whisper small)
```

−14.1 LUFS, −1.8 dBTP, no frame-check findings.

## What making it taught Thesium

- Whisper stamps some first words early (the opening "A" at 0.0 s instead of 0.7 s). The hearing
  check and this film's word times give each heard word to the nearest line instead of cutting by
  time windows.
- Bar heights linear in dB make an 11 dB dip look like a 40 % one; the music lane squares them so
  the step aside reads at a glance.
- The score's last chord was still ringing at 24 s and would have clicked off: every master now
  fades its last 0.4 s.
- Strips across each scene change caught what stills did not: an outgoing caption still fading
  while the next arrived in the same place. Captions now leave before the next one enters.
