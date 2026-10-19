"""Audio analysis for films you cannot hear.

  beats  <audio> <out.json>        beat grid, downbeats and hits (numpy tracker)
  check  <audio> <out-prefix>      integrated loudness, true peak, waveform + spectrum images

Beat tracker adapted from Kianzzz/xilo-opus-video (MIT, © 2026 周行).
"""
import json
import re
import subprocess
import sys

import numpy as np


def load_mono(path, sr=22050):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32), sr


def beats(y, sr):
    hop, n_fft = 256, 1024
    frames = 1 + (len(y) - n_fft) // hop
    if frames < 16:
        raise SystemExit('Audio is too short to track beats.')
    win = np.hanning(n_fft)
    spec = np.abs(np.fft.rfft(np.stack([y[i * hop:i * hop + n_fft] * win for i in range(frames)]), axis=1))
    flux = np.maximum(0, np.diff(np.log1p(spec), axis=0)).sum(axis=1)
    onset = np.concatenate([[0], flux])
    onset = (onset - onset.mean()) / (onset.std() + 1e-9)
    fps = sr / hop
    ac = np.correlate(onset, onset, mode='full')[len(onset) - 1:]
    lags = np.arange(int(fps * 60 / 180), int(fps * 60 / 60) + 1)
    score = ac[lags] * np.exp(-0.5 * (np.log2(60 * fps / lags / 120) / 0.9) ** 2)
    i = int(np.argmax(score))
    period = float(lags[i])
    if 0 < i < len(score) - 1:
        l, c, r = score[i - 1], score[i], score[i + 1]
        den = l - 2 * c + r
        period += 0.5 * (l - r) / den if den != 0 else 0
    n = len(onset)

    def grid(o):
        return [int(round(o + k * period)) for k in range(int((n - o) / period) + 1) if round(o + k * period) < n]

    phase = max(range(int(period)), key=lambda o: onset[grid(o)].sum())
    out, t, w = [], float(phase), max(2, int(period * 0.12))
    while t < n:
        c = int(round(t))
        lo, hi = max(0, c - w), min(n, c + w + 1)
        j = lo + int(np.argmax(onset[lo:hi]))
        pos = j if onset[j] > 0.5 else c
        out.append(pos)
        t = pos + period
    lag = n_fft / 2 / sr
    beat_t = np.array(out) / fps + lag
    down0 = max(range(4), key=lambda k: onset[out[k::4]].sum()) if len(out) >= 4 else 0
    peaks = [k for k in range(1, n - 1) if onset[k] > 2 and onset[k] >= onset[k - 1] and onset[k] >= onset[k + 1]]
    hits, last = [], -10 ** 9
    for k in peaks:
        if k - last > fps * 0.1:
            hits.append(k / fps + lag)
            last = k
    return 60 * fps / period, beat_t.tolist(), beat_t[down0::4].tolist(), hits


def cmd_beats(path, out):
    y, sr = load_mono(path)
    bpm, b, d, h = beats(y, sr)
    r = lambda xs: [round(x, 3) for x in xs]
    data = {'bpm': round(bpm, 2), 'beats': r(b), 'downbeats': r(d), 'hits': r(h),
            'duration': round(len(y) / sr, 3),
            'use': 'beats → state changes, downbeats → big moments, hits → SFX'}
    json.dump(data, open(out, 'w'), indent=1)
    print(f'{out}: {bpm:.1f} BPM, {len(b)} beats, {len(d)} downbeats, {len(h)} hits')


def cmd_check(path, prefix):
    st = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                        capture_output=True, text=True).stderr
    summary = st[st.rfind('Summary:'):]
    lufs = re.search(r'I:\s+(-?[\d.]+) LUFS', summary)
    peak = re.search(r'Peak:\s+(-?[\d.]+) dBFS', summary)
    lra = re.search(r'LRA:\s+(-?[\d.]+) LU', summary)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-filter_complex',
                    'showwavespic=s=1600x300:split_channels=1', '-frames:v', '1', f'{prefix}-wave.png'])
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-lavfi',
                    'showspectrumpic=s=1600x500:legend=1', f'{prefix}-spectrum.png'])
    y, sr = load_mono(path, 22050)
    win = sr // 2
    rms = [float(np.sqrt(np.mean(y[i:i + win] ** 2)) + 1e-9) for i in range(0, len(y) - win, win)]
    quiet = [round(i * 0.5, 1) for i, v in enumerate(rms) if 20 * np.log10(v) < -45]
    spec = np.abs(np.fft.rfft(y[: sr * 30])) if len(y) else np.zeros(1)
    freqs = np.fft.rfftfreq(min(len(y), sr * 30), 1 / sr)
    band = lambda a, b: float(np.sum(spec[(freqs >= a) & (freqs < b)] ** 2)) + 1e-9
    low_vs_mid = 10 * np.log10(band(20, 120) / band(120, 4000))
    report = {
        'integratedLufs': float(lufs.group(1)) if lufs else None,
        'truePeakDbfs': float(peak.group(1)) if peak else None,
        'loudnessRangeLu': float(lra.group(1)) if lra else None,
        'lowToMidDb': round(low_vs_mid, 1),
        'nearSilentSeconds': quiet[:40],
        'images': [f'{prefix}-wave.png', f'{prefix}-spectrum.png'],
        'targets': 'Thesium masters to -14 LUFS / -1 dBTP. Low-to-mid around -3 to +3 dB reads well on phones.',
    }
    json.dump(report, open(f'{prefix}-audio.json', 'w'), indent=1)
    print(json.dumps(report, indent=1))


if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[1] == 'beats':
        cmd_beats(sys.argv[2], sys.argv[3])
    elif len(sys.argv) == 4 and sys.argv[1] == 'check':
        cmd_check(sys.argv[2], sys.argv[3])
    else:
        print(__doc__)
