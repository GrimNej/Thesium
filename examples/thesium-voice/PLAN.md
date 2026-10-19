# Hears every word: plan

A 24 s, 16:9, 30 fps narrated film on the web engine, in the launch film's world: cold fractal fog,
bone type, one cyan accent, Space Grotesk for statements, JetBrains Mono for data, Unbounded for
the name. The picture is drawn from Thesium's own output for this narration
(`assets/hearing.json`, made by `tools/data.mjs`): the voice and music envelopes, the time of
every heard word, the music's dip, and Kokoro's phonemes.

## Throughline

A playhead at the centre of the frame, as in the launch film. The narration's waveform scrolls
through it; every caption word lights at the moment Whisper heard it. Captions sit at the top
(y 200, 52 px) for lines 1–5, so the centre is free for the proof of each line.

## Shots (times from audio/voice.timeline.json)

| Time | Section | Voice | Picture |
| --- | --- | --- | --- |
| 0–4.6 | Cannot hear | "A model that makes films can't hear its own voice-over." | Fog rises; the waveform lane draws out from the playhead (0.2–1.0) and scrolls; caption words light as spoken; a `t =` readout under the playhead. |
| 4.6–8.8 | Writes it down | "So Thesium writes down what was said, and reads it back." | As each word ends, a mono token with its time leaves the playhead and lands in a transcript row below the lane; on "reads it back" (7.38) a scan line passes over the row and each token flashes. |
| 8.8–12.2 | Checks every word | "Every word is checked against the script." | The lane sinks away. Two aligned rows: SCRIPT (bone) over HEARD (cyan mono); each pair gets a check as its word ends; a counter runs to "54 / 54 words heard" (the real result). |
| 12.2–16.4 | Names as sound | "When a name is misheard, it shows how the name was spoken." | SCRIPT "Thesium sees" over HEARD "These EMC's" from an earlier take (struck in warm red); on "shows how" the phonemes `/θˈiːziəm/` resolve large in cyan under "KOKORO SAID". |
| 16.4–19.7 | Music steps aside | "And the music steps aside whenever the voice speaks." | Two lanes through the playhead: MUSIC (cyan, the ducked envelope, with the un-ducked envelope as a faint outline) over VOICE (bone); the music visibly dips under each phrase; readout "music −11.2 dB while the voice speaks". |
| 19.7–20.0 | breath | (music drop) | Everything fades back to fog. |
| 20.0–24 | Hears every word | "Thesium. Hears every word." | THESIUM lands with the chord (scale 1.06→1, glow); "Hears every word." lights word by word; a mono line with the command and the URL; holds settled from 22 s. |

## Sound

Score `audio/score.py` (D minor, 96 BPM, a bar every 2.5 s): pad, a quiet pulse from 5 s, a lift
at 15 s so the dip under line 5 is audible and visible, a drop at 19.6 s, one chord with bells at
20 s. Narration `audio/voice.json`, Kokoro `af_heart` at 0.92 (lines 2 and 4 at 0.84), levelled
to −16 LUFS; the music ducks automatically for 10 LU of separation.
