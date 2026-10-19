"""Score for "Thesium": F# minor, 120 BPM, 15 bars (a bar every 2 s), cut to timeline.json."""
from synth import Song

song = Song(bpm=120, bars=15, key='F#m', seed=11, tail=2.5)
P = ['i', 'VI', 'III', 'VII']

# 0–8 s: a cold pad alone, then the kick at 4.0 and a riser into the reveal.
song.pad(bars=(0, 13), progression=P, bars_per_chord=2, brightness=0.32, gain=0.9)
song.drums(bars=(2, 12), pattern='four_on_floor', fills=True)
song.bass(bars=(2, 12), progression=P, bars_per_chord=2, style='offbeat', cutoff=650)
song.riser(at_bar=3, length_bars=1, gain=0.75)
song.impact(at_bar=4, gain=0.95)

# 12–24 s: the arp carries the proofs and the "Same film" passes.
song.arp(bars=(6, 12), progression=P, bars_per_chord=2, rate=16, octave=5, brightness=0.55, gain=0.8)

# 24.6–25.0: near-silence, then the final chord on 26.0 rings to the end.
song.drop(bars=(12.3, 12.5), keep=('fx',), depth=0.03)
song.riser(at_bar=12.5, length_bars=0.5, gain=0.55)
song.impact(at_bar=13, gain=0.55)
song.pad(bars=(13, 15), progression=['i'], bars_per_chord=2, brightness=0.55, gain=1.7)
song.bells(bars=(13, 14), notes=[(0, 'F#5', 4), (0, 'C#6', 4), (1, 'A5', 3)], gain=1.1)

song.render('audio/score.wav', stems='audio/stems')
