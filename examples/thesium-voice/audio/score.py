"""Score for "Hears every word": D minor, 96 BPM (a bar every 2.5 s), 24 s, cut to timeline.json.

The music stays under the voice: a pad, then a quiet pulse while Thesium listens, a lift for the
"music steps aside" line so the ducking is plain to see, a breath, and one chord for the name.
"""
from synth import Song

song = Song(bpm=96, bars=10, key='Dm', seed=5, tail=1.5)
P = ['i', 'VI', 'III', 'VII']

# 0–5 s: the pad alone under the first line.
song.pad(bars=(0, 8), progression=P, bars_per_chord=2, brightness=0.3, gain=0.85)

# 5–15 s: a quiet pulse joins as Thesium writes down and checks the words.
song.bass(bars=(2, 8), progression=P, bars_per_chord=2, style='sustain', cutoff=480, gain=0.6)
song.arp(bars=(2, 6), progression=P, bars_per_chord=2, rate=8, octave=5, brightness=0.4, gain=0.5)

# 15–20 s: the lift; the voice speaks over it from 16.6 s and the music steps aside.
song.drums(bars=(6, 8), pattern='halftime', fills=False, velocity=0.8)
song.arp(bars=(6, 8), progression=P, bars_per_chord=2, rate=16, octave=5, brightness=0.6, gain=0.75)
song.riser(at_bar=7, length_bars=1, gain=0.45)

# 19.6–20 s: a breath, then one chord with the name.
song.drop(bars=(7.84, 8.0), keep=('fx',), depth=0.03)
song.impact(at_bar=8, gain=0.55)
song.pad(bars=(8, 9), progression=['i'], bars_per_chord=2, brightness=0.55, gain=1.4)
song.bells(bars=(8, 9), notes=[(0, 'D5', 4), (0, 'A5', 4), (1, 'F5', 3)], gain=0.9)

song.render('audio/score.wav', stems='audio/stems')
