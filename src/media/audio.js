// Sound mastering: mix the declared stems, normalise loudness (two-pass EBU R128), limit,
// and mux with the picture so the encoded AAC never clips.
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { run } from '../core/proc.js';
import { inside } from '../core/paths.js';
import { ff, ffmpeg } from './ffmpeg.js';

/**
 * Mixes music, SFX and voice from thesium.json into one normalised WAV of exactly the film's
 * length. Returns undefined when the film declares no sound.
 * @param {string} workspace
 * @param {import('../core/manifest.js').Manifest} m
 * @param {string} output .wav
 * @param {{ signal?: AbortSignal }} [o]
 */
export async function mixAudio(workspace, m, output, o = {}) {
  /** @type {Array<{ file: string, gain: number }>} */
  const parts = [];
  for (const key of /** @type {const} */ (['music', 'sfx', 'voice'])) {
    const rel = m.audio[key];
    if (rel) parts.push({ file: inside(workspace, rel), gain: m.audio.gains[key] ?? 0 });
  }
  if (!parts.length) return undefined;
  const d = m.duration;
  const chains = parts.map(
    (p, i) => `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=0:${d},volume=${p.gain}dB[a${i}]`,
  );
  const mixed = `${output}.mix.wav`;
  await ff(
    [
      ...parts.flatMap((p) => ['-i', p.file]),
      '-filter_complex',
      `${chains.join(';')};${parts.map((_, i) => `[a${i}]`).join('')}amix=inputs=${parts.length}:duration=longest:normalize=0[m]`,
      '-map',
      '[m]',
      '-t',
      String(d),
      '-ar',
      '48000',
      mixed,
    ],
    { timeout: 600000, signal: o.signal },
  );
  const target = `I=${m.audio.loudness}:TP=${m.audio.truePeak - 0.5}:LRA=11`;
  const { stderr } = await run(ffmpeg(), ['-hide_banner', '-i', mixed, '-af', `loudnorm=${target}:print_format=json`, '-f', 'null', '-'], {
    timeout: 600000,
    signal: o.signal,
  });
  const measured = JSON.parse(stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1));
  const silent = !Number.isFinite(Number(measured.input_i)) || Number(measured.input_i) < -70;
  const normalize = silent
    ? 'anull'
    : `loudnorm=${target}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
  // A brick-wall limiter after loudness: dense synthesized scores otherwise overshoot in AAC.
  await ff(['-i', mixed, '-af', `${normalize},alimiter=limit=0.708:attack=1:release=60:level=0:asc=1`, '-ar', '48000', '-t', String(d), output], {
    timeout: 600000,
    signal: o.signal,
  });
  await rm(mixed, { force: true });
  return output;
}

/** Highest decoded sample peak of a file's audio in dBFS. @param {string} file */
export async function decodedPeakDb(file) {
  const { stderr } = await run(ffmpeg(), ['-hide_banner', '-i', file, '-vn', '-af', 'astats=metadata=0:reset=0', '-f', 'null', '-'], { timeout: 300000 });
  const peaks = [...stderr.matchAll(/Peak level dB:\s*(-?\d+(?:\.\d+)?)/g)].map((x) => Number(x[1]));
  return peaks.length ? Math.max(...peaks) : undefined;
}

/**
 * Muxes picture and (optional) sound into the delivery MP4 of exactly `duration` seconds.
 * Lowers the AAC gain in steps until the decoded peak is below -0.3 dBFS.
 * @param {string} picture silent H.264
 * @param {string | undefined} sound normalised WAV
 * @param {string} output
 * @param {number} duration
 * @param {(line: string) => void} [log]
 */
export async function mux(picture, sound, output, duration, log) {
  for (const gain of sound ? [0, -1.5, -3, -4.5] : [0]) {
    const args = ['-i', picture];
    if (sound) args.push('-i', sound);
    args.push('-map', '0:v');
    if (sound) args.push('-map', '1:a', '-af', `volume=${gain}dB`, '-c:a', 'aac', '-b:a', '256k', '-ar', '48000');
    args.push('-c:v', 'copy', '-t', String(duration), '-movflags', '+faststart', output);
    await ff(args, { timeout: 600000 });
    if (!sound) return;
    const peak = await decodedPeakDb(output);
    if (peak === undefined || peak < -0.3) return;
    log?.(`encoded audio peaks at ${peak.toFixed(2)} dBFS; re-encoding ${(gain - 1.5).toFixed(1)} dB lower`);
  }
}

/**
 * Loudness, true peak and loudness range of a file (EBU R128).
 * @param {string} file
 */
export async function loudness(file) {
  const { stderr } = await run(ffmpeg(), ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], {
    timeout: 300000,
  });
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  const num = (re) => {
    const x = re.exec(summary);
    return x ? Number(x[1]) : undefined;
  };
  return {
    integratedLufs: num(/I:\s+(-?[\d.]+) LUFS/),
    loudnessRangeLu: num(/LRA:\s+(-?[\d.]+) LU/),
    truePeakDbfs: num(/Peak:\s+(-?[\d.]+) dBFS/),
  };
}

/** Spans where the picture is near black. @param {string} file */
export async function blackSpans(file) {
  const { stderr } = await run(ffmpeg(), ['-hide_banner', '-i', file, '-vf', 'blackdetect=d=0.25:pic_th=0.97:pix_th=0.06', '-an', '-f', 'null', '-'], {
    timeout: 600000,
  });
  return [...stderr.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g)].map((x) => ({
    start: Number(x[1]),
    end: Number(x[2]),
    duration: Number(x[3]),
  }));
}

/** Waveform and spectrum pictures of an audio file, for checking sound you cannot hear. @param {string} input @param {string} prefix */
export async function audioPictures(input, prefix) {
  const wave = `${prefix}-wave.png`;
  const spectrum = `${prefix}-spectrum.png`;
  await ff(['-i', input, '-filter_complex', 'showwavespic=s=1600x300:split_channels=1:colors=0x6FE7F2|0xF3C969', '-frames:v', '1', wave]);
  await ff(['-i', input, '-lavfi', 'showspectrumpic=s=1600x500:legend=1', spectrum]);
  return { wave, spectrum, dir: path.dirname(wave) };
}
