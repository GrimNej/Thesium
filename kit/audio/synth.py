"""Thesium synth: compose original music and sound effects in code (numpy + scipy, offline).

From Vmotion (the studio Thesium grew out of); deterministic for a given seed.

Quick start: write audio/score.py and run `node thesium.mjs sound score audio/score.py`
(the kit is on the import path):

    from synth import Song
    song = Song(bpm=124, bars=32, key='F#m', seed=3)
    P = ['i', 'VI', 'III', 'VII']
    song.drums(bars=(4, 28), pattern='four_on_floor', fills=True)
    song.bass(bars=(8, 28), progression=P, style='offbeat')
    song.pad(bars=(0, 32), progression=P)
    song.arp(bars=(12, 28), progression=P, rate=16)
    song.lead(bars=(20, 28), notes=[(0, 'C#5', 1), (1, 'E5', 1), (2, 'F#5', 2)])  # (beat, note, beats) per bar loop
    song.riser(at_bar=11, length_bars=1); song.impact(at_bar=12)
    song.drop(bars=(19, 20))              # near-silence before the payoff
    song.render('audio/score.wav', stems='audio/stems')

Concepts
- Time: bars and beats on a fixed grid; song.t(bar, beat) converts to seconds.
- Buses: drums, bass, chords, lead, fx. Each bus has gain, reverb send and optional sidechain.
- Every instrument is also a plain function returning a mono numpy array at SR, so you can
  place anything anywhere with song.place(sound, seconds, bus='fx', gain=0.8, pan=0.0).
- Progressions are roman numerals relative to `key` (e.g. 'i', 'iv', 'VI', 'V7', 'bVII').
- Deterministic: the same seed renders the same audio.

Mix craft built in: kick-driven sidechain on bass/chords, bus reverb, gentle master
compression and a true-peak-safe limiter. Thesium masters the final film to -14 LUFS.
"""
from __future__ import annotations

import json
import math
import os
import re
import wave

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000

# ── Utilities ───────────────────────────────────────────────────────────────

NOTE_INDEX = {'C': 0, 'C#': 1, 'DB': 1, 'D': 2, 'D#': 3, 'EB': 3, 'E': 4, 'F': 5, 'F#': 6, 'GB': 6,
              'G': 7, 'G#': 8, 'AB': 8, 'A': 9, 'A#': 10, 'BB': 10, 'B': 11}


def midi(note) -> float:
    """'A4' → 69, 60 → 60."""
    if isinstance(note, (int, float)):
        return float(note)
    m = re.fullmatch(r'([A-Ga-g][#b]?)(-?\d)', note.strip())
    if not m:
        raise ValueError(f'Bad note: {note}')
    return NOTE_INDEX[m.group(1).upper()] + 12 * (int(m.group(2)) + 1)


def hz(note) -> float:
    return 440.0 * 2 ** ((midi(note) - 69) / 12)


def t_(d):
    return np.arange(int(round(d * SR))) / SR


def silence(d):
    return np.zeros(int(round(d * SR)))


def adsr(n, a=0.005, d=0.1, s=0.7, r=0.1, length=None):
    """Envelope of n samples. length = gate time (s) before release; defaults to n - release."""
    out = np.zeros(n)
    A, D, R = int(a * SR), int(d * SR), int(r * SR)
    gate = int((length if length is not None else n / SR - r) * SR)
    gate = max(1, min(gate, n))
    idx = np.arange(n)
    out = np.where(idx < A, idx / max(A, 1), 0.0)
    dec = (idx >= A) & (idx < A + D)
    out = np.where(dec, 1 - (1 - s) * (idx - A) / max(D, 1), out)
    out = np.where((idx >= A + D) & (idx < gate), s, out)
    level = out[gate - 1] if gate - 1 < n else s
    rel = idx >= gate
    out = np.where(rel, level * np.clip(1 - (idx - gate) / max(R, 1), 0, 1), out)
    return out


def exp_env(d, tau):
    return np.exp(-t_(d) / tau)


def lp(x, f, order=2):
    f = min(max(f, 20), SR / 2 - 100)
    return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    f = min(max(f, 20), SR / 2 - 100)
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [max(lo, 20), min(hi, SR / 2 - 100)], 'band', fs=SR, output='sos'), x)


def sweep_lp(x, f_from, f_to, order=2, block=512):
    """Lowpass whose cutoff moves exponentially from f_from to f_to across the signal."""
    out = np.zeros_like(x)
    n = len(x)
    zi = None
    for i in range(0, n, block):
        p = i / max(n - 1, 1)
        f = f_from * (f_to / f_from) ** p
        sos = butter(order, min(max(f, 30), SR / 2 - 200), 'low', fs=SR, output='sos')
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        out[i:i + block], zi = sosfilt(sos, x[i:i + block], zi=zi)
    return out


def norm(x, peak=1.0):
    m = np.max(np.abs(x)) if len(x) else 0
    return x * (peak / m) if m > 0 else x


def mix(*parts):
    """Sum mono arrays of different lengths (shorter ones are zero-padded)."""
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[:len(p)] += p
    return out


def saturate(x, drive=1.5):
    return np.tanh(x * drive) / np.tanh(drive)


def osc(kind, freq, d, phase=0.0, rng=None):
    """Band-limited-ish oscillators: sine, saw, square, tri, noise. freq may be an array (glide)."""
    n = int(round(d * SR))
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,)) if np.ndim(freq) else np.full(n, float(freq))
    ph = (np.cumsum(f) / SR + phase) % 1.0
    if kind == 'sine':
        return np.sin(2 * np.pi * ph)
    if kind == 'saw':
        # PolyBLEP-corrected saw
        dt = f / SR
        y = 2 * ph - 1
        y -= _blep(ph, dt)
        return y
    if kind == 'square':
        dt = f / SR
        y = np.where(ph < 0.5, 1.0, -1.0)
        y += _blep(ph, dt) - _blep((ph + 0.5) % 1, dt)
        return y
    if kind == 'tri':
        return 2 * np.abs(2 * ph - 1) - 1
    if kind == 'noise':
        return (rng or np.random.default_rng(0)).standard_normal(n)
    raise ValueError(kind)


def _blep(ph, dt):
    y = np.zeros_like(ph)
    m1 = ph < dt
    t1 = ph[m1] / dt[m1]
    y[m1] = t1 + t1 - t1 * t1 - 1
    m2 = ph > 1 - dt
    t2 = (ph[m2] - 1) / dt[m2]
    y[m2] = t2 * t2 + t2 + t2 + 1
    return y


def supersaw(freq, d, voices=7, detune=0.18, rng=None):
    rng = rng or np.random.default_rng(1)
    spread = np.linspace(-1, 1, voices) * detune
    out = sum(osc('saw', freq * 2 ** (s / 12), d, phase=rng.random()) for s in spread)
    return out / math.sqrt(voices)


# ── Instruments (mono, normalized, SR) ──────────────────────────────────────

def kick(punch=1.0, tone=52, length=0.45, click=0.6):
    tt = t_(length)
    f = tone + (tone * 3.2) * np.exp(-tt * 38) * punch
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / (length * 0.38))
    c = hp(np.random.default_rng(3).standard_normal(len(tt)), 2500) * np.exp(-tt / 0.004) * click
    return norm(saturate(body * 1.2 + c, 1.4))


def snare(tone=190, snappy=0.8, length=0.28, seed=5):
    tt = t_(length)
    body = np.sin(2 * np.pi * tone * tt) * np.exp(-tt / 0.045) + np.sin(2 * np.pi * tone * 1.6 * tt) * np.exp(-tt / 0.03) * 0.5
    nz = bp(np.random.default_rng(seed).standard_normal(len(tt)), 1800, 9000) * np.exp(-tt / (0.09 * snappy + 0.02))
    return norm(body * 0.6 + nz)


def clap(length=0.35, seed=8):
    rng = np.random.default_rng(seed)
    out = np.zeros(len(t_(length)) + 8)
    for k, off in enumerate([0, 0.011, 0.022, 0.034]):
        s = int(off * SR)
        d = length - off
        tt = t_(d)
        burst = bp(rng.standard_normal(len(tt)), 900, 5000) * np.exp(-tt / (0.008 if k < 3 else 0.12))
        m = min(len(burst), len(out) - s)
        out[s:s + m] += burst[:m]
    return norm(out)


def hat(open_=False, length=None, seed=11):
    d = length or (0.32 if open_ else 0.06)
    tt = t_(d)
    nz = hp(np.random.default_rng(seed).standard_normal(len(tt)), 7000, order=4)
    metal = sum(np.sign(np.sin(2 * np.pi * f * tt)) for f in (317, 432, 539, 619, 783)) * 0.08
    return norm((nz + hp(metal, 6000)) * np.exp(-tt / (d * (0.45 if open_ else 0.28))))


def tom(note='A2', length=0.4):
    tt = t_(length)
    f = hz(note) * (1 + 0.6 * np.exp(-tt * 25))
    return norm(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.14))


def cymbal(length=2.2, seed=13):
    tt = t_(length)
    nz = hp(np.random.default_rng(seed).standard_normal(len(tt)), 4500, order=3)
    return norm(nz * np.exp(-tt / (length * 0.35)))


def bass_note(note, d, kind='saw', cutoff=900, env_amt=1800, drive=1.6, sub=0.6):
    f = hz(note)
    x = osc(kind, f, d) * 0.6 + osc('sine', f, d) * sub + osc('sine', f * 2, d) * 0.12
    x = sweep_lp(x, cutoff + env_amt, cutoff, order=2) if env_amt else lp(x, cutoff)
    return norm(saturate(x * adsr(len(x), 0.004, 0.12, 0.85, 0.05), drive))


def sub808(note, d, glide_from=None, drive=2.2):
    tt = t_(d)
    f = hz(note)
    if glide_from is not None:
        f = f + (hz(glide_from) - f) * np.exp(-tt * 18)
    x = np.sin(2 * np.pi * np.cumsum(np.broadcast_to(f, tt.shape)) / SR)
    x = saturate(x, drive) * adsr(len(tt), 0.003, 0.2, 0.9, 0.08)
    return norm(x + 0.15 * np.sin(4 * np.pi * np.cumsum(np.broadcast_to(f, tt.shape)) / SR) * adsr(len(tt), 0.003, 0.2, 0.9, 0.08))


def pad_chord(notes, d, brightness=0.45, attack=0.8, release=1.2, voices=5, seed=2):
    rng = np.random.default_rng(seed)
    x = sum(supersaw(hz(n), d + release, voices=voices, detune=0.12, rng=rng) for n in notes) / max(len(notes), 1)
    x = lp(x, 400 + 4600 * brightness, order=2)
    return norm(x * adsr(len(x), attack, 0.5, 0.85, release, length=d))


def pluck(note, d=0.35, brightness=0.6, kind='saw'):
    x = osc(kind, hz(note), d) + 0.4 * osc('square', hz(note) * 1.003, d)
    x = sweep_lp(x, 800 + 9000 * brightness, 300, order=2)
    return norm(x * np.exp(-t_(d) / (d * 0.35)))


def lead_note(note, d, kind='supersaw', cutoff=3200, vibrato=0.15):
    tt = t_(d)
    f = hz(note) * (1 + 0.004 * vibrato * np.sin(2 * np.pi * 5.5 * tt) * np.clip(tt * 3, 0, 1))
    x = supersaw(f, d, voices=5, detune=0.1) if kind == 'supersaw' else osc(kind, f, d)
    x = lp(x, cutoff)
    return norm(x * adsr(len(x), 0.01, 0.15, 0.8, 0.12))


def bell(note, d=1.6, index=3.5, ratio=3.5):
    tt = t_(d)
    f = hz(note)
    mod = np.sin(2 * np.pi * f * ratio * tt) * index * np.exp(-tt / 0.4)
    return norm(np.sin(2 * np.pi * f * tt + mod) * np.exp(-tt / (d * 0.4)))


def riser(d=2.0, seed=21):
    tt = t_(d)
    p = tt / d
    nz = np.random.default_rng(seed).standard_normal(len(tt))
    noise_part = sweep_lp(nz, 300, 12000) * p ** 2
    tone_part = osc('saw', 120 * 2 ** (p * 4), d) * p ** 3 * 0.35
    return norm(hp(noise_part + tone_part, 150) * np.clip((1 - p) * 40, 0, 1))


def downlifter(d=1.6, seed=22):
    return norm(riser(d, seed)[::-1] * exp_env(d, d * 0.5))


def impact(length=2.5, seed=31):
    tt = t_(length)
    boom = np.sin(2 * np.pi * np.cumsum(38 + 90 * np.exp(-tt * 9)) / SR) * np.exp(-tt / 0.6)
    crack = hp(np.random.default_rng(seed).standard_normal(len(tt)), 2000) * np.exp(-tt / 0.05)
    tail = lp(np.random.default_rng(seed + 1).standard_normal(len(tt)), 1200) * np.exp(-tt / 0.9) * 0.4
    return norm(saturate(boom * 1.2 + crack * 0.6 + tail, 1.3))


def whoosh(d=0.5, seed=41, up=True):
    tt = t_(d)
    nz = np.random.default_rng(seed).standard_normal(len(tt))
    f0, f1 = (400, 5000) if up else (5000, 400)
    x = sweep_lp(nz, f0, f1) - sweep_lp(nz, f0 * 0.4, f1 * 0.4) * 0.6
    return norm(x * np.sin(np.pi * tt / d) ** 2)


def click(pitch=1.0, seed=51):
    d = 0.05
    tt = t_(d)
    tr = hp(np.random.default_rng(seed).standard_normal(len(tt)), 3000) * np.exp(-tt / 0.0015)
    body = np.sin(2 * np.pi * 2400 * pitch * tt) * np.exp(-tt / 0.006)
    return norm(tr * 0.7 + body)


def blip(note='E6', d=0.12):
    return norm(osc('sine', hz(note), d) * np.exp(-t_(d) / 0.04))


def pop(d=0.18):
    tt = t_(d)
    return norm(np.sin(2 * np.pi * np.cumsum(500 + 900 * np.exp(-tt * 40)) / SR) * np.exp(-tt / 0.05))


def glitch(d=0.3, seed=61):
    rng = np.random.default_rng(seed)
    n = int(d * SR)
    out = np.zeros(n)
    i = 0
    while i < n:
        seg_len = int(rng.integers(200, 2400))
        kind = rng.integers(0, 3)
        tt = np.arange(min(seg_len, n - i)) / SR
        if kind == 0:
            s = np.sign(np.sin(2 * np.pi * rng.uniform(200, 3000) * tt))
        elif kind == 1:
            s = rng.standard_normal(len(tt))
        else:
            s = np.zeros(len(tt))
        out[i:i + len(tt)] = s * rng.uniform(0.2, 1)
        i += seg_len
    return norm(bp(out, 300, 9000))


def shimmer(d=1.5, base='E6'):
    tt = t_(d)
    f = hz(base)
    x = sum(np.sin(2 * np.pi * f * k * tt + k) * np.exp(-tt / (d * 0.3 / k ** 0.5)) for k in (1, 1.5, 2, 3))
    return norm(x * np.clip(tt * 30, 0, 1))


def tick(d=0.03):
    return norm(osc('sine', 3200, d) * np.exp(-t_(d) / 0.005))


def thump(d=0.35):
    tt = t_(d)
    return norm(np.sin(2 * np.pi * np.cumsum(60 + 80 * np.exp(-tt * 30)) / SR) * np.exp(-tt / 0.08))


SFX = {
    'impact': lambda **k: impact(k.get('length', 2.5)),
    'boom': lambda **k: impact(k.get('length', 3.5), seed=33) * 1.0,
    'hit': lambda **k: norm(mix(kick(1.2, 50, 0.5), snare(length=0.3) * 0.7)),
    'whoosh': lambda **k: whoosh(k.get('length', 0.5)),
    'swish': lambda **k: whoosh(k.get('length', 0.25), seed=43),
    'riser': lambda **k: riser(k.get('length', 2.0)),
    'downlifter': lambda **k: downlifter(k.get('length', 1.6)),
    'click': lambda **k: click(k.get('pitch', 1.0)),
    'tick': lambda **k: tick(),
    'pop': lambda **k: pop(),
    'blip': lambda **k: blip(),
    'glitch': lambda **k: glitch(k.get('length', 0.3)),
    'shimmer': lambda **k: shimmer(k.get('length', 1.5)),
    'sparkle': lambda **k: shimmer(k.get('length', 0.8), 'B6'),
    'type': lambda **k: click(1.6, 77) * 0.6,
    'snap': lambda **k: norm(clap(0.18)),
    'thump': lambda **k: thump(),
}


# ── Effects ─────────────────────────────────────────────────────────────────

def reverb_ir(seconds=2.4, damp=5000, seed=91, predelay=0.012):
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    tt = np.arange(n) / SR
    decay = np.exp(-tt * 6.9 / seconds)
    left = lp(rng.standard_normal(n), damp) * decay
    right = lp(rng.standard_normal(n), damp) * decay
    pad = np.zeros(int(predelay * SR))
    return np.concatenate([pad, left]), np.concatenate([pad, right])


def reverb(stereo, seconds=2.4, mix=0.25, damp=5000):
    il, ir = reverb_ir(seconds, damp)
    wl = fftconvolve(stereo[0], il)[:stereo.shape[1]]
    wr = fftconvolve(stereo[1], ir)[:stereo.shape[1]]
    wet = np.stack([wl, wr])
    wet *= (np.max(np.abs(stereo)) + 1e-9) / (np.max(np.abs(wet)) + 1e-9)
    return stereo * (1 - mix * 0.5) + wet * mix


def delay(stereo, seconds, feedback=0.35, mix=0.25, pingpong=True):
    d = int(seconds * SR)
    out = stereo.copy()
    tap = stereo.copy()
    for k in range(1, 7):
        g = feedback ** k
        if g < 0.02:
            break
        shifted = np.zeros_like(stereo)
        shifted[:, d * k:] = tap[:, :stereo.shape[1] - d * k] if d * k < stereo.shape[1] else 0
        if pingpong and k % 2:
            shifted = shifted[::-1]
        out += lp(shifted, 5000) * g * mix
    return out


def pan(mono, p=0.0):
    a = (p + 1) * math.pi / 4
    return np.stack([mono * math.cos(a), mono * math.sin(a)])


def compress(stereo, threshold_db=-14, ratio=3.0, attack=0.005, release=0.12):
    level = np.max(np.abs(stereo), axis=0)
    a, r = math.exp(-1 / (attack * SR)), math.exp(-1 / (release * SR))
    # envelope follower, vectorized in blocks for speed
    env = np.zeros_like(level)
    e = 0.0
    step = 64
    for i in range(0, len(level), step):
        peak = level[i:i + step].max()
        e = a * e + (1 - a) * peak if peak > e else r * e + (1 - r) * peak
        env[i:i + step] = e
    db = 20 * np.log10(env + 1e-9)
    over = np.maximum(db - threshold_db, 0)
    gain = 10 ** (-over * (1 - 1 / ratio) / 20)
    return stereo * gain


def limit(stereo, ceiling_db=-1.2):
    ceiling = 10 ** (ceiling_db / 20)
    # soft clip then hard ceiling with 4x headroom check
    x = np.tanh(stereo / ceiling * 0.9) * ceiling / np.tanh(0.9)
    peak = np.max(np.abs(x))
    return x * (ceiling / peak) if peak > ceiling else x


# ── Harmony ─────────────────────────────────────────────────────────────────

MAJOR = [0, 2, 4, 5, 7, 9, 11]
MINOR = [0, 2, 3, 5, 7, 8, 10]
ROMAN = {'I': 0, 'II': 1, 'III': 2, 'IV': 3, 'V': 4, 'VI': 5, 'VII': 6}


def parse_key(key: str):
    m = re.fullmatch(r'([A-Ga-g][#b]?)(m|min|minor|maj|major)?', key.strip())
    if not m:
        raise ValueError(f'Bad key: {key}')
    root = NOTE_INDEX[m.group(1).upper()]
    minor = (m.group(2) or '').startswith('m') and not (m.group(2) or '').startswith('maj')
    return root, minor


def chord(numeral: str, key: str, octave=4, voicing='triad'):
    """Roman numeral → MIDI notes. 'i', 'iv', 'VI', 'V7', 'bVII', 'ii°', 'IVmaj7', 'vi9', 'Isus4'."""
    root, minor = parse_key(key)
    scale = MINOR if minor else MAJOR
    m = re.fullmatch(r'(b|#)?([ivIV]+)(°|o|\+)?(maj7|7|9|sus2|sus4|add9)?', numeral)
    if not m:
        raise ValueError(f'Bad numeral: {numeral}')
    acc = {'b': -1, '#': 1}.get(m.group(1) or '', 0)
    deg = ROMAN[m.group(2).upper()]
    quality_minor = m.group(2).islower()
    base = 12 * (octave + 1) + root + scale[deg] + acc
    third = 3 if quality_minor else 4
    fifth = 6 if m.group(3) in ('°', 'o') else 8 if m.group(3) == '+' else 7
    notes = [base, base + third, base + fifth]
    ext = m.group(4)
    if ext == 'sus2':
        notes[1] = base + 2
    elif ext == 'sus4':
        notes[1] = base + 5
    elif ext == '7':
        notes.append(base + (10 if quality_minor or deg == 4 else 10))
    elif ext == 'maj7':
        notes.append(base + 11)
    elif ext in ('9', 'add9'):
        notes.append(base + 14)
    if voicing == 'spread':
        notes = [notes[0] - 12] + notes[1:] + [notes[0] + 12]
    return notes


def scale_notes(key: str, octave=4, count=8):
    root, minor = parse_key(key)
    scale = MINOR if minor else MAJOR
    base = 12 * (octave + 1) + root
    return [base + scale[i % 7] + 12 * (i // 7) for i in range(count)]


# ── Song ────────────────────────────────────────────────────────────────────

class Song:
    BUSES = ('drums', 'bass', 'chords', 'lead', 'fx', 'voice')

    def __init__(self, bpm=120, bars=16, key='Am', beats_per_bar=4, seed=1, tail=2.5, start=0.0):
        self.bpm, self.bars, self.key, self.bpb, self.seed = bpm, bars, key, beats_per_bar, seed
        self.spb = 60.0 / bpm
        self.start = start
        self.length = start + bars * beats_per_bar * self.spb + tail
        n = int(self.length * SR) + SR
        self.bus = {b: np.zeros((2, n)) for b in self.BUSES}
        self.gain = {'drums': 0.9, 'bass': 0.8, 'chords': 0.5, 'lead': 0.55, 'fx': 0.7, 'voice': 1.0}
        self.send = {'drums': 0.08, 'bass': 0.0, 'chords': 0.35, 'lead': 0.28, 'fx': 0.3, 'voice': 0.05}
        self.kicks: list[float] = []
        self.mutes: list[tuple[float, float, float]] = []
        self.rng = np.random.default_rng(seed)

    # time ------------------------------------------------------------------
    def t(self, bar, beat=0.0):
        """Seconds at bar (0-based) and beat (0-based, fractional allowed)."""
        return self.start + (bar * self.bpb + beat) * self.spb

    def beats(self):
        return [round(self.t(b // self.bpb, b % self.bpb), 4) for b in range(self.bars * self.bpb)]

    # placement -------------------------------------------------------------
    def place(self, sound, at, bus='fx', gain=0.8, pan_=0.0):
        """Place a mono (or stereo 2×n) sound at `at` seconds on a bus."""
        st = sound if sound.ndim == 2 else pan(sound, pan_)
        i = int(round(at * SR))
        if i < 0:
            st, i = st[:, -i:], 0
        buf = self.bus[bus]
        n = min(st.shape[1], buf.shape[1] - i)
        if n > 0:
            buf[:, i:i + n] += st[:, :n] * gain

    def _range(self, bars):
        a, b = bars if bars else (0, self.bars)
        return range(int(a), int(min(b, self.bars)))

    # drums -----------------------------------------------------------------
    PATTERNS = {
        # 16 steps per bar: K kick, S snare, C clap, h closed hat, o open hat, '.' rest
        'four_on_floor': ('K...K...K...K...', '....S.......S...', '..h...h...h...h.', '..............o.'),
        'driving':       ('K.....K.K.......', '....S.......S...', 'h.h.h.h.h.h.h.h.', '................'),
        'breakbeat':     ('K.........K.....', '....S.......S..S', 'h.h.h.h.h.h.h.h.', '.......o........'),
        'halftime':      ('K.........K.....', '........S.......', 'h...h...h...h...', '................'),
        'trap':          ('K......K..K.....', '........S.......', 'hhhhhhhhhhhhhhhh', '................'),
        'minimal':       ('K...K...K...K...', '................', '..h...h...h...h.', '................'),
        'march':         ('K.......K.......', '....S..S....S.SS', '................', '................'),
    }

    def drums(self, bars=None, pattern='four_on_floor', fills=True, swing=0.0, clap_on_snare=True,
              kick_kw=None, ride=False, velocity=1.0):
        k_snd = kick(**(kick_kw or {}))
        s_snd, c_snd = snare(), clap()
        h_snd, o_snd = hat(), hat(open_=True)
        kp, sp, hp_, op = self.PATTERNS[pattern]
        steps = 16
        for bar in self._range(bars):
            last_of_phrase = fills and (bar + 1) % 8 == 0
            for s in range(steps):
                beat = s / 4 + (swing * 0.25 if s % 2 else 0)
                at = self.t(bar, beat)
                acc = 1.0 if s % 4 == 0 else 0.8
                if kp[s] == 'K':
                    self.place(k_snd, at, 'drums', 1.0 * velocity)
                    self.kicks.append(at)
                if sp[s] == 'S' and not (last_of_phrase and s >= 12):
                    self.place(s_snd, at, 'drums', 0.75 * velocity, 0.05)
                    if clap_on_snare:
                        self.place(c_snd, at, 'drums', 0.45 * velocity, -0.1)
                if hp_[s] == 'h':
                    self.place(h_snd, at, 'drums', 0.32 * acc * velocity, 0.3)
                if op[s] == 'o':
                    self.place(o_snd, at, 'drums', 0.3 * velocity, 0.35)
                if ride and s % 4 == 2:
                    self.place(hat(open_=True, length=0.6, seed=12), at, 'drums', 0.18 * velocity, -0.3)
            if last_of_phrase:
                for j, s in enumerate(range(12, 16)):
                    self.place(snare(tone=200 + j * 25), self.t(bar, s / 4), 'drums', 0.55 + 0.1 * j)
                self.place(cymbal(), self.t(bar + 1), 'drums', 0.35, 0.2)

    def roll(self, at_bar, length_bars=1, gain=0.7):
        """Snare roll accelerating into at_bar + length_bars."""
        n = 4 * self.bpb * length_bars
        for i in range(int(n * 2)):
            p = i / (n * 2)
            beat = (p ** 0.7) * length_bars * self.bpb
            self.place(snare(tone=180 + 80 * p), self.t(at_bar, beat), 'drums', gain * (0.3 + 0.7 * p))

    # tonal parts -------------------------------------------------------------
    def _progression_at(self, progression, bar, bars_per_chord=1):
        return progression[(bar // bars_per_chord) % len(progression)]

    def bass(self, bars=None, progression=('i',), style='offbeat', bars_per_chord=1, octave=2, kind='saw',
             cutoff=700, gain=1.0):
        """style: offbeat | eighths | sustain | octaves | sub808 | rolling"""
        for bar in self._range(bars):
            root = chord(self._progression_at(progression, bar, bars_per_chord), self.key, octave)[0]
            hits = {
                'offbeat': [(b + 0.5, 0.45) for b in range(self.bpb)],
                'eighths': [(b / 2, 0.45) for b in range(self.bpb * 2)],
                'sustain': [(0, self.bpb * 0.98)],
                'octaves': [(b / 2, 0.45) for b in range(self.bpb * 2)],
                'rolling': [(b / 4, 0.22) for b in range(self.bpb * 4) if b % 4 != 0],
                'sub808': [(0, 1.5), (2.5, 1.2)],
            }[style]
            for j, (beat, dur) in enumerate(hits):
                note = root + (12 if style == 'octaves' and j % 2 else 0)
                d = dur * self.spb
                snd = sub808(note, d) if style == 'sub808' else bass_note(note, d, kind=kind, cutoff=cutoff)
                self.place(snd, self.t(bar, beat), 'bass', 0.8 * gain)

    def pad(self, bars=None, progression=('i',), bars_per_chord=1, octave=4, brightness=0.45, gain=1.0,
            voicing='spread'):
        for bar in self._range(bars):
            if bar % bars_per_chord:
                continue
            notes = chord(self._progression_at(progression, bar, bars_per_chord), self.key, octave, voicing)
            d = bars_per_chord * self.bpb * self.spb
            self.place(pad_chord(notes, d, brightness=brightness, seed=bar), self.t(bar), 'chords', 0.6 * gain)

    def stabs(self, bars=None, progression=('i',), rhythm=(0, 1.5, 3), octave=4, gain=1.0):
        for bar in self._range(bars):
            notes = chord(self._progression_at(progression, bar), self.key, octave)
            for beat in rhythm:
                snd = norm(sum(pluck(n, 0.28, 0.8) for n in notes))
                self.place(snd, self.t(bar, beat), 'chords', 0.5 * gain, 0.0)

    def arp(self, bars=None, progression=('i',), rate=16, octave=5, pattern='up', bars_per_chord=1,
            brightness=0.6, gain=1.0, pan_spread=0.4):
        steps_per_beat = rate // 4
        for bar in self._range(bars):
            notes = chord(self._progression_at(progression, bar, bars_per_chord), self.key, octave)
            seq = notes + [notes[0] + 12]
            if pattern == 'down':
                seq = seq[::-1]
            elif pattern == 'updown':
                seq = seq + seq[-2:0:-1]
            for s in range(self.bpb * steps_per_beat):
                note = seq[s % len(seq)]
                d = self.spb / steps_per_beat * 0.9
                p = pan_spread * math.sin(s * 0.9)
                self.place(pluck(note, max(d * 2.2, 0.12), brightness), self.t(bar, s / steps_per_beat),
                           'lead', 0.35 * gain, p)

    def lead(self, bars=None, notes=(), kind='supersaw', cutoff=3200, gain=1.0, loop_bars=1):
        """notes: (beat_in_loop, note, length_in_beats) repeated every loop_bars."""
        for bar in self._range(bars):
            if (bar - (bars[0] if bars else 0)) % loop_bars:
                continue
            for beat, note, length in notes:
                d = length * self.spb
                self.place(lead_note(note, d, kind=kind, cutoff=cutoff), self.t(bar, beat), 'lead', 0.5 * gain)

    def bells(self, bars=None, notes=(), gain=1.0, loop_bars=1):
        for bar in self._range(bars):
            if (bar - (bars[0] if bars else 0)) % loop_bars:
                continue
            for beat, note, length in notes:
                self.place(bell(note, max(length * self.spb, 0.8)), self.t(bar, beat), 'lead', 0.4 * gain)

    def melody(self, bars=None, motif=(0, 2, 4, 2), rhythm=(0, 1, 2, 3), lengths=None, octave=5, kind='pluck',
               gain=1.0, loop_bars=1):
        """Scale-degree motif in the key. kind: pluck | bell | lead."""
        sc = scale_notes(self.key, octave, 15)
        lengths = lengths or [1] * len(motif)
        notes = [(rhythm[i], sc[motif[i] % len(sc)], lengths[i]) for i in range(len(motif))]
        if kind == 'bell':
            self.bells(bars, notes, gain, loop_bars)
        elif kind == 'lead':
            self.lead(bars, notes, gain=gain, loop_bars=loop_bars)
        else:
            for bar in self._range(bars):
                if (bar - (bars[0] if bars else 0)) % loop_bars:
                    continue
                for beat, note, length in notes:
                    self.place(pluck(note, max(length * self.spb, 0.2), 0.7), self.t(bar, beat), 'lead', 0.45 * gain)

    # transitions ------------------------------------------------------------
    def riser(self, at_bar, length_bars=1, gain=0.8):
        d = length_bars * self.bpb * self.spb
        self.place(riser(d), self.t(at_bar), 'fx', gain)

    def downlifter(self, at_bar, length_bars=1, gain=0.6):
        self.place(downlifter(length_bars * self.bpb * self.spb), self.t(at_bar), 'fx', gain)

    def impact(self, at_bar, beat=0, gain=0.9):
        self.place(impact(), self.t(at_bar, beat), 'fx', gain)
        self.place(cymbal(), self.t(at_bar, beat), 'drums', 0.4, -0.2)

    def drop(self, bars, keep=('fx',), depth=0.04):
        """Near-silence for [start_bar, end_bar): everything except `keep` buses ducks to `depth`."""
        self.mutes.append((self.t(bars[0]), self.t(bars[1]), depth, tuple(keep)))

    def sfx(self, name, at, gain=0.7, **kw):
        """Place a named SFX (see SFX keys) at seconds `at`."""
        self.place(SFX[name](**kw), at, 'fx', gain)

    # render -----------------------------------------------------------------
    def _sidechain(self, depth=0.55, release=0.18):
        n = self.bus['bass'].shape[1]
        g = np.ones(n)
        rel = int(release * SR)
        curve = 1 - depth * np.exp(-np.arange(rel) / (rel / 4))
        for k in self.kicks:
            i = int(k * SR)
            m = min(rel, n - i)
            if m > 0:
                g[i:i + m] = np.minimum(g[i:i + m], curve[:m])
        return g

    def mixdown(self, sidechain=0.55, reverb_seconds=2.6):
        sc = self._sidechain(sidechain) if self.kicks and sidechain else 1.0
        dry = np.zeros_like(self.bus['drums'])
        send = np.zeros_like(dry)
        stems = {}
        for name, buf in self.bus.items():
            x = buf * self.gain[name]
            if name in ('bass', 'chords') and self.kicks:
                x = x * sc
            if name == 'bass':
                x = np.stack([lp(x[0], 6000), lp(x[1], 6000)])
                x[0] = hp(x[0], 32)
                x[1] = hp(x[1], 32)
            for start, end, depth, keep in self.mutes:
                if name in keep:
                    continue
                a, b = int(start * SR), int(end * SR)
                fade = int(0.03 * SR)
                env = np.ones(x.shape[1])
                env[a:b] = depth
                env[max(a - fade, 0):a] = np.linspace(1, depth, a - max(a - fade, 0))
                x = x * env
            stems[name] = x
            dry += x
            send += x * self.send[name]
        wet = reverb(send, reverb_seconds, mix=1.0) if np.any(send) else send
        mix = dry + wet * 0.6
        mix = compress(mix, -16, 2.5)
        mix = limit(mix * 1.4, -1.2)
        end = int(self.length * SR)
        return mix[:, :end], {k: v[:, :end] for k, v in stems.items()}

    def render(self, path, stems=None, timeline=None):
        mix, parts = self.mixdown()
        write_wav(path, mix)
        if stems:
            os.makedirs(stems, exist_ok=True)
            for name, data in parts.items():
                if np.any(data):
                    write_wav(os.path.join(stems, f'{name}.wav'), limit(data, -1.0))
        info = {'bpm': self.bpm, 'bars': self.bars, 'key': self.key, 'beatsPerBar': self.bpb,
                'start': self.start, 'duration': round(self.length, 3), 'beats': self.beats(),
                'downbeats': [round(self.t(b), 4) for b in range(self.bars)]}
        with open(timeline or os.path.splitext(path)[0] + '.timeline.json', 'w') as f:
            json.dump(info, f, indent=1)
        peak = 20 * math.log10(np.max(np.abs(mix)) + 1e-9)
        print(f'{path}: {self.length:.2f}s, {self.bpm} BPM, peak {peak:.1f} dBFS')
        return path


def write_wav(path, data):
    data = np.atleast_2d(data)
    if data.shape[0] > data.shape[1]:
        data = data.T
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    pcm = (np.clip(data, -1, 1).T * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(data.shape[0])
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def render_sfx(spec_path, out_path):
    """Render an SFX timeline JSON: {"duration": s, "events": [{"t", "sound", "gain", "pan", ...}]}"""
    spec = json.load(open(spec_path))
    n = int(spec['duration'] * SR) + SR
    out = np.zeros((2, n))
    for ev in spec['events']:
        name = ev['sound']
        if name not in SFX:
            raise SystemExit(f"Unknown sound '{name}'. Choose from: {', '.join(SFX)}")
        kw = {k: v for k, v in ev.items() if k in ('length', 'pitch')}
        snd = SFX[name](**kw)
        if ev.get('pitch') and name not in ('click',):
            ratio = float(ev['pitch'])
            idx = np.arange(0, len(snd), ratio)
            snd = np.interp(idx, np.arange(len(snd)), snd)
        st = pan(snd, float(ev.get('pan', 0)))
        i = int(float(ev['t']) * SR)
        m = min(st.shape[1], n - i)
        if m > 0:
            out[:, i:i + m] += st[:, :m] * float(ev.get('gain', 0.7))
    out = out[:, :int(spec['duration'] * SR)]
    write_wav(out_path, limit(out, -1.0))
    print(f"{out_path}: {len(spec['events'])} events, {spec['duration']}s")


if __name__ == '__main__':
    import sys
    if len(sys.argv) == 4 and sys.argv[1] == 'sfx':
        render_sfx(sys.argv[2], sys.argv[3])
    elif len(sys.argv) == 2 and sys.argv[1] == 'demo':
        s = Song(bpm=124, bars=16, key='F#m', seed=3)
        P = ['i', 'VI', 'III', 'VII']
        s.drums(bars=(4, 16), pattern='four_on_floor')
        s.bass(bars=(4, 16), progression=P)
        s.pad(bars=(0, 16), progression=P)
        s.arp(bars=(8, 16), progression=P)
        s.riser(at_bar=3)
        s.impact(at_bar=4)
        s.render('synth-demo.wav')
    else:
        print(__doc__)
