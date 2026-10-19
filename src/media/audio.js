// Sound mastering: mix the declared stems, normalise loudness (two-pass EBU R128), limit,
// and mux with the picture so the encoded AAC never clips.
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { run } from '../core/proc.js';
import { inside } from '../core/paths.js';
import { ff, ffmpeg } from './ffmpeg.js';

/**
 * Where a narration track speaks: the complement of its silences, with short pauses inside a
 * phrase merged so the music does not pump between words.
 * @param {string} file @param {number} duration
 * @returns {Promise<Array<[number, number]>>}
 */
export async function speechSpans(file, duration) {
  const { stderr } = await run(ffmpeg(), ['-hide_banner', '-i', file, '-af', 'silencedetect=noise=-45dB:d=0.3', '-f', 'null', '-'], { timeout: 600000 });
  /** @type {Array<[number, number]>} */
  const silences = [];
  let start;
  for (const line of stderr.split(/\r?\n/)) {
    const s = /silence_start: (-?[\d.]+)/.exec(line);
    const e = /silence_end: ([\d.]+)/.exec(line);
    if (s) start = Math.max(0, Number(s[1]));
    if (e) {
      silences.push([start ?? 0, Number(e[1])]);
      start = undefined;
    }
  }
  if (start !== undefined) silences.push([start, duration]);
  /** @type {Array<[number, number]>} */
  const spans = [];
  let cursor = 0;
  for (const [a, b] of silences) {
    if (a - cursor > 0.05) spans.push([cursor, a]);
    cursor = b;
  }
  if (duration - cursor > 0.05) spans.push([cursor, duration]);
  /** @type {Array<[number, number]>} */
  const merged = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last && span[0] - last[1] < 0.6) last[1] = span[1];
    else merged.push([...span]);
  }
  return merged;
}

/**
 * A volume expression that dips by `db` during each span, easing in 0.2 s before the voice and
 * out over 0.35 s after it.
 * @param {Array<[number, number]>} spans @param {number} db
 */
export function duckExpression(spans, db) {
  const k = (1 - 10 ** (-db / 20)).toFixed(4);
  const factor = ([a, b]) => `(1-${k}*clip(min((t-${(a - 0.2).toFixed(3)})/0.2,(${(b + 0.35).toFixed(3)}-t)/0.35),0,1))`;
  return spans.length ? spans.map(factor).join('*') : '1';
}

/** Where "duck": "auto" puts the narration: this many LU above the music while it speaks. */
export const VOICE_OVER_MUSIC = 10;

/**
 * Loudness of the voice stem and of the music stem inside the speech spans, each with its gain
 * and the music dipped by `dip` dB.
 * @param {string} workspace @param {import('../core/manifest.js').Manifest} m
 * @param {Array<[number, number]>} spans @param {string} scratch @param {number} dip
 */
async function stemLevels(workspace, m, spans, scratch, dip) {
  const d = m.duration;
  const fit = `aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=0:${d}`;
  const inSpeech = spans.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join('+');
  const duck = dip > 0 ? `,volume=eval=frame:volume='${duckExpression(spans, dip)}'` : '';
  const v = path.join(scratch, `levels-voice-${process.pid}.wav`);
  const mu = path.join(scratch, `levels-music-${process.pid}.wav`);
  try {
    await ff(['-i', inside(workspace, /** @type {string} */ (m.audio.voice)), '-af', `${fit},volume=${m.audio.gains.voice}dB`, v]);
    await ff(['-i', inside(workspace, /** @type {string} */ (m.audio.music)), '-af', `${fit},volume=${m.audio.gains.music}dB,asetnsamples=n=480${duck},volume=eval=frame:volume='min(1,${inSpeech})'`, mu]);
    return { voice: (await loudness(v)).integratedLufs, music: (await loudness(mu)).integratedLufs };
  } finally {
    await rm(v, { force: true });
    await rm(mu, { force: true });
  }
}

/**
 * How far the music dips under the narration, in dB: audio.duck when it is a number; with
 * "auto", just enough for the voice to sit VOICE_OVER_MUSIC LU above the music while it speaks
 * (0 to 24 dB), whatever the score's level.
 * @param {string} workspace @param {import('../core/manifest.js').Manifest} m
 * @param {Array<[number, number]>} spans @param {string} scratch
 */
export async function duckDepth(workspace, m, spans, scratch) {
  if (typeof m.audio.duck === 'number') return m.audio.duck;
  if (!spans.length) return 0;
  const { voice, music } = await stemLevels(workspace, m, spans, scratch, 0);
  if (voice === undefined || music === undefined || !Number.isFinite(voice) || !Number.isFinite(music)) return 0;
  return Number(Math.min(24, Math.max(0, VOICE_OVER_MUSIC - (voice - music))).toFixed(1));
}

/**
 * How far the narration sits above the music while it speaks, in LU, as mixed (gains and
 * ducking). Transcription cannot judge this: Whisper hears speech through music that people
 * find too loud. Undefined unless both are declared.
 * @param {string} workspace @param {import('../core/manifest.js').Manifest} m @param {string} scratch folder for temp files
 */
export async function narrationBalance(workspace, m, scratch) {
  if (!m.audio.voice || !m.audio.music) return undefined;
  const spans = await speechSpans(inside(workspace, m.audio.voice), m.duration);
  if (!spans.length) return undefined;
  const dip = await duckDepth(workspace, m, spans, scratch);
  const { voice, music } = await stemLevels(workspace, m, spans, scratch, dip);
  if (voice === undefined || music === undefined || !Number.isFinite(voice)) return undefined;
  return { lu: Number.isFinite(music) ? Number((voice - music).toFixed(1)) : 99, dip, auto: m.audio.duck === 'auto' };
}

/**
 * Mixes music, SFX and voice from thesium.json into one normalised WAV of exactly the film's
 * length; music dips under the narration (audio.duck). Returns undefined when the film declares
 * no sound.
 * @param {string} workspace
 * @param {import('../core/manifest.js').Manifest} m
 * @param {string} output .wav
 * @param {{ signal?: AbortSignal }} [o]
 */
export async function mixAudio(workspace, m, output, o = {}) {
  /** @type {Array<{ key: string, file: string, gain: number }>} */
  const parts = [];
  for (const key of /** @type {const} */ (['music', 'sfx', 'voice'])) {
    const rel = m.audio[key];
    if (rel) parts.push({ key, file: inside(workspace, rel), gain: m.audio.gains[key] ?? 0 });
  }
  if (!parts.length) return undefined;
  const d = m.duration;
  const voice = parts.find((p) => p.key === 'voice');
  let duck;
  if (voice && parts.some((p) => p.key === 'music')) {
    const spans = await speechSpans(voice.file, d);
    const dip = await duckDepth(workspace, m, spans, path.dirname(output));
    if (dip > 0) duck = duckExpression(spans, dip);
  }
  const chains = parts.map(
    (p, i) =>
      `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=0:${d},volume=${p.gain}dB` +
      `${p.key === 'music' && duck ? `,asetnsamples=n=480,volume=eval=frame:volume='${duck}'` : ''}[a${i}]`,
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
 * AAC encoding can push inter-sample peaks over the limiter, so the encoded file's true peak
 * (EBU R128, oversampled) is measured and the gain lowered in small steps until it is at or
 * below `truePeak`.
 * @param {string} picture silent H.264
 * @param {string | undefined} sound normalised WAV
 * @param {string} output
 * @param {number} duration
 * @param {(line: string) => void} [log]
 * @param {number} [truePeak] dBTP ceiling for the delivered sound
 */
export async function mux(picture, sound, output, duration, log, truePeak = -1) {
  for (const gain of sound ? [0, -0.5, -1, -1.5, -2, -3, -4.5] : [0]) {
    const args = ['-i', picture];
    if (sound) args.push('-i', sound);
    args.push('-map', '0:v');
    if (sound) args.push('-map', '1:a', '-af', `volume=${gain}dB`, '-c:a', 'aac', '-b:a', '256k', '-ar', '48000');
    args.push('-c:v', 'copy', '-t', String(duration), '-movflags', '+faststart', output);
    await ff(args, { timeout: 600000 });
    if (!sound) return;
    const measured = (await loudness(output)).truePeakDbfs;
    if (measured === undefined || measured <= truePeak) return;
    log?.(`encoded audio reaches ${measured.toFixed(2)} dBTP; re-encoding lower`);
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
