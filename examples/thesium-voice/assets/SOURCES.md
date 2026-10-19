# Sources

| File | Where it came from | Rights / notes |
| --- | --- | --- |
| `hearing.json` | Thesium's own output for this film, built by `tools/data.mjs`: loudness envelopes of `audio/voice.wav` and `audio/score.wav` (the music ducked as the master ducks it), Whisper's word times, the hearing check's count (54 of 54) and Kokoro's phonemes for "Thesium" | Generated here; MIT with the repository |
| "These EMC's" (the misheard name in 12–16 s) | A real hearing-check result from an earlier take of the line "Thesium sees every frame it makes" (Kokoro `af_heart` at speed 1.0, Whisper small), made while building `sound voice`; this film's own narration was heard in full | Thesium output |
| Narration | Kokoro-82M (`af_heart`) through `sound voice`, from `audio/voice.json` | Apache-2.0 model; the script is ours |
| Score | `audio/score.py` with Thesium's synth | Original |
