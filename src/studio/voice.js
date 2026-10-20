// Narration: lines of a script placed on the film's clock and spoken by a local voice (Kokoro),
// the system's voice, any text-to-speech command line, or recorded takes. Each synthesised line is
// cached by everything that shapes it, so editing one line re-speaks only that line. When
// faster-whisper is installed, a hearing check transcribes the result and compares it with the
// script, because the director cannot listen.
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { run } from '../core/proc.js';
import { inside, rel } from '../core/paths.js';
import { loadManifest } from '../core/manifest.js';
import { ff, probe } from '../media/ffmpeg.js';
import { loudness } from '../media/audio.js';
import { hasModule, py } from './python.js';

export const MODEL_HOME = process.env.THESIUM_MODELS || path.join(os.homedir(), '.thesium', 'models');

/** Kokoro voice ids start with a letter for their language. */
const LANG = { a: 'en-us', b: 'en-gb', e: 'es', f: 'fr-fr', h: 'hi', i: 'it', j: 'ja', p: 'pt-br', z: 'cmn' };

/** Narration is levelled here before the mix; the master's loudness target applies after. */
const VOICE_LUFS = -16;

const RELEASE = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0';
/** Kokoro-82M (Apache-2.0) as ONNX, pinned by size and SHA-256. */
const KOKORO = {
  model: { name: 'kokoro-v1.0.onnx', size: 325532387, sha256: '7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5' },
  voices: { name: 'voices-v1.0.bin', size: 28214398, sha256: 'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d' },
};

/**
 * @typedef {object} Line
 * @property {number} t start, seconds on the film's clock
 * @property {string} [text] what is said; the hearing check expects these words
 * @property {string} [say] a respelling to speak instead of text (pronunciation)
 * @property {string} [file] a recorded take in the film folder instead of synthesis
 * @property {string} [voice]
 * @property {number} [speed]
 * @property {string} [lang]
 * @property {number} [gain] dB
 */

/**
 * @typedef {object} Take
 * @property {Line} line
 * @property {string} file
 * @property {boolean} recorded
 * @property {string} voice
 * @property {number} speed
 * @property {string} lang
 * @property {string} say
 * @property {number} [seconds]
 */

/** @param {string} url @param {string} file @param {{ size: number, sha256: string }} pin @param {(s: string) => void} [log] */
async function download(url, file, pin, log) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
  const part = `${file}.part`;
  const hash = createHash('sha256');
  let got = 0;
  let shown = 0;
  const body = Readable.fromWeb(/** @type {any} */ (res.body));
  body.on('data', (chunk) => {
    hash.update(chunk);
    got += chunk.length;
    const tenth = Math.floor((got / pin.size) * 10);
    if (tenth > shown) log?.(`  ${path.basename(file)} ${(shown = tenth) * 10}%`);
  });
  await pipeline(body, createWriteStream(part));
  const digest = hash.digest('hex');
  if (got !== pin.size || digest !== pin.sha256) {
    await rm(part, { force: true });
    throw new Error(`${path.basename(file)} does not match its pinned size and SHA-256 (got ${got} bytes, ${digest}); not using it`);
  }
  await rename(part, file);
}

/** Kokoro's model files, downloaded once into ~/.thesium/models/kokoro. @param {(s: string) => void} [log] */
export async function ensureKokoro(log) {
  const dir = path.join(MODEL_HOME, 'kokoro');
  await mkdir(dir, { recursive: true });
  const files = {};
  for (const [key, pin] of Object.entries(KOKORO)) {
    const file = path.join(dir, pin.name);
    if ((await stat(file).catch(() => undefined))?.size !== pin.size) {
      log?.(`downloading ${pin.name} (${Math.round(pin.size / 1e6)} MB, once)`);
      await download(`${RELEASE}/${pin.name}`, file, pin, log);
    }
    files[key] = file;
  }
  return /** @type {{ model: string, voices: string }} */ (files);
}

/** @param {string} line @param {string} cwd @param {string} [input] */
function sh(line, cwd, input) {
  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', `"${line}"`] : ['-c', line];
  return run(shell, args, { cwd, timeout: 600000, input, verbatim: true });
}

/** The operating system's own voice: SAPI on Windows, say on macOS, espeak-ng on Linux. @param {Take} take @param {string} textFile */
async function systemVoice(take, textFile) {
  if (process.platform === 'win32') {
    const script = [
      'Add-Type -AssemblyName System.Speech',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      'if ($env:THESIUM_VOICE) { $s.SelectVoice($env:THESIUM_VOICE) }',
      '$s.Rate = [int]$env:THESIUM_RATE',
      '$s.SetOutputToWaveFile($env:THESIUM_OUT)',
      '$s.Speak([IO.File]::ReadAllText($env:THESIUM_TEXT))',
      '$s.Dispose()',
    ].join('; ');
    const rate = String(Math.max(-10, Math.min(10, Math.round((take.speed - 1) * 10))));
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      timeout: 120000,
      env: { THESIUM_VOICE: take.voice, THESIUM_RATE: rate, THESIUM_OUT: take.file, THESIUM_TEXT: textFile },
    });
  } else if (process.platform === 'darwin') {
    const voice = take.voice ? ['-v', take.voice] : [];
    await run('say', ['-o', take.file, '--file-format=WAVE', '--data-format=LEI16@22050', '-r', String(Math.round(175 * take.speed)), ...voice, '-f', textFile], { timeout: 120000 });
  } else {
    const voice = take.voice ? ['-v', take.voice] : [];
    await run('espeak-ng', ['-w', take.file, '-s', String(Math.round(175 * take.speed)), ...voice, '-f', textFile], { timeout: 120000 });
  }
}

/**
 * Speaks every take that is not cached yet.
 * @param {string} ws @param {string} provider @param {any} spec @param {Take[]} todo @param {(s: string) => void} [log]
 */
async function synthesise(ws, provider, spec, todo, log) {
  const scratch = path.join(ws, '.thesium', 'voice');
  await mkdir(scratch, { recursive: true });
  if (provider === 'kokoro') {
    if (!(await hasModule('kokoro_onnx'))) throw new Error('Narration with Kokoro needs kokoro-onnx: python -m pip install kokoro-onnx (or set "provider": "system" for a temp track)');
    const files = await ensureKokoro(log);
    const jobs = path.join(scratch, 'jobs.json');
    await writeFile(jobs, JSON.stringify(todo.map((t) => ({ text: t.say, voice: t.voice, speed: t.speed, lang: t.lang || undefined, out: t.file }))));
    log?.(`speaking ${todo.length} line${todo.length === 1 ? '' : 's'} with Kokoro`);
    await py(ws, [path.join(ws, 'kit', 'audio', 'voice.py'), 'kokoro', files.model, files.voices, jobs]);
    return;
  }
  for (const [i, take] of todo.entries()) {
    const textFile = path.join(scratch, `line-${i}.txt`);
    await writeFile(textFile, take.say);
    if (provider === 'system') await systemVoice(take, textFile);
    else {
      const raw = path.join(scratch, `line-${i}-raw.wav`);
      const fill = (/** @type {string} */ s) =>
        s.replace(/\{(\w+)\}/g, (all, k) => ({ out: raw, textFile, voice: take.voice, speed: take.speed, lang: take.lang })[k] ?? all);
      await sh(fill(spec.command), ws, take.say);
      if (!existsSync(raw)) throw new Error(`The voice command wrote nothing at {out} for "${take.say.slice(0, 60)}"`);
      await ff(['-i', raw, '-ac', '1', take.file]);
    }
    if (!existsSync(take.file)) throw new Error(`No audio was written for "${take.say.slice(0, 60)}"`);
  }
}

/** Scripts written without spaces between words: compared character by character. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;

/** Lower-case words without punctuation or accents (single characters for Chinese, Japanese, Thai). @param {string} s */
export const words = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .split(/[^\p{L}\p{N}']+/u)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean)
    .flatMap((w) => (UNSPACED.test(w) ? [...w] : [w]));

/** @param {string} a @param {string} b */
function similarity(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length, 1);
}

/**
 * @typedef {{ word: string, state: 'ok' | 'near' | 'missed', as?: string }} WordState
 * @typedef {{ matched: number, near: Array<[string, string]>, missed: string[], states: WordState[] }} Comparison
 */

/** Counts and lists derived from per-word states. @param {WordState[]} states @returns {Comparison} */
function summarise(states) {
  return {
    matched: states.filter((s) => s.state === 'ok').length,
    near: states.filter((s) => s.state === 'near').map((s) => /** @type {[string, string]} */ ([s.word, s.as || ''])),
    missed: states.filter((s) => s.state === 'missed').map((s) => s.word),
    states,
  };
}

/**
 * Aligns the words a line should say with the words that were heard.
 * @param {string[]} expected @param {string[]} heard
 * @returns {Comparison}
 */
export function compareWords(expected, heard) {
  const cost = (a, b) => (a === b ? 0 : similarity(a, b) >= 0.7 ? 0.4 : 1);
  const n = expected.length;
  const k = heard.length;
  const d = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: k + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= k; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost(expected[i - 1], heard[j - 1]));
  /** @type {WordState[]} */
  const states = [];
  for (let i = n, j = k; i > 0 || j > 0; ) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + cost(expected[i - 1], heard[j - 1])) {
      const c = cost(expected[i - 1], heard[j - 1]);
      states.unshift({ word: expected[i - 1], state: c === 0 ? 'ok' : c < 1 ? 'near' : 'missed', ...(c > 0 ? { as: heard[j - 1] } : {}) });
      i--;
      j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) states.unshift({ word: expected[--i], state: 'missed' });
    else j--;
  }
  return summarise(states);
}

/** Two listeners: a word counts as heard when either heard it. @param {Comparison} a @param {Comparison} b */
export function eitherHeard(a, b) {
  const rank = { ok: 2, near: 1, missed: 0 };
  return summarise(a.states.map((s, i) => (b.states[i] && rank[b.states[i].state] > rank[s.state] ? b.states[i] : s)));
}

/**
 * Transcribes `audio` and compares each line of the timeline with what was heard around it.
 * A neutral pass comes first. Whisper does not know invented names, so when a capitalised word
 * is missed a second pass is told those names (as a viewer who reads them on screen would know
 * them), and a word counts as heard when either pass heard it. Returns undefined without
 * faster-whisper.
 * @param {string} ws @param {string} audio
 * @param {Array<{ t: number, end: number, text?: string }>} lines
 * @param {{ language?: string, signal?: AbortSignal }} [o]
 */
export async function hearLines(ws, audio, lines, o = {}) {
  if (process.env.THESIUM_HEARING === '0' || !(await hasModule('faster_whisper'))) return undefined;
  const spoken = lines.filter((l) => l.text && words(l.text).length);
  if (!spoken.length) return undefined;
  const model = process.env.THESIUM_WHISPER || 'small';
  const transcribe = async (hotwords = '') => {
    const out = path.join(ws, '.thesium', 'voice', `heard-${process.pid}.json`);
    await mkdir(path.dirname(out), { recursive: true });
    await py(ws, [path.join(ws, 'kit', 'audio', 'voice.py'), 'hear', audio, out, model, (o.language || '').slice(0, 2), hotwords], { signal: o.signal });
    const transcript = JSON.parse(await readFile(out, 'utf8'));
    await rm(out, { force: true });
    // Each heard word belongs to the nearest line (Whisper's first word is often stamped early).
    /** @type {string[][]} */
    const assigned = spoken.map(() => []);
    for (const w of transcript.words) {
      let best = -1;
      let distance = Infinity;
      spoken.forEach((l, i) => {
        const gap = w.start < l.t ? l.t - w.start : w.start > l.end ? w.start - l.end : 0;
        if (gap < distance) [best, distance] = [i, gap];
      });
      if (best >= 0 && distance <= 1.5) assigned[best].push(w.word);
    }
    return spoken.map((l, i) => {
      const heard = assigned[i].join(' ');
      return { t: l.t, text: /** @type {string} */ (l.text), heard, ...compareWords(words(/** @type {string} */ (l.text)), words(heard)) };
    });
  };
  let report = await transcribe();
  const capitalised = new Set(spoken.flatMap((l) => /** @type {string} */ (l.text).split(/\s+/).filter((w) => /^\p{Lu}/u.test(w)).flatMap(words)));
  const names = [...new Set(report.flatMap((l) => [...l.missed, ...l.near.map((n) => n[0])]).filter((w) => capitalised.has(w)))];
  if (names.length) {
    const original = new Map(spoken.flatMap((l) => /** @type {string} */ (l.text).split(/\s+/)).map((w) => [words(w)[0], w.replace(/[^\p{L}\p{N}'-]/gu, '')]));
    const second = await transcribe(names.map((n) => original.get(n) || n).join(' '));
    report = report.map((l, i) => ({ ...l, ...eitherHeard(l, second[i]), heardWithNames: second[i].heard }));
    names.splice(0, names.length, ...names.map((n) => original.get(n) || n));
  }
  const expected = report.reduce((a, l) => a + words(l.text).length, 0);
  const heard = report.reduce((a, l) => a + l.matched + l.near.length, 0);
  return { model, names, share: expected ? heard / expected : 1, words: expected, lines: report };
}

/** @param {NonNullable<Awaited<ReturnType<typeof hearLines>>>} h */
export function describeHearing(h) {
  const out = [`Heard ${Math.round(h.share * 100)}% of ${h.words} words (Whisper ${h.model}${h.names.length ? `; a second pass was told ${h.names.join(', ')}` : ''})`];
  for (const l of h.lines) {
    const notes = [
      ...l.near.map(([want, got]) => `"${got}" for "${want}"`),
      ...(l.missed.length ? [`missed ${l.missed.map((w) => `"${w}"`).join(', ')}`] : []),
    ];
    if (notes.length) out.push(`  ${l.t.toFixed(2)} s: ${notes.join('; ')} (heard: "${l.heard}")`);
  }
  return out.join('\n');
}

/**
 * Builds the narration track from audio/voice.json.
 * @param {string} ws @param {string[]} args [spec] [out]
 * @param {{ log?: (s: string) => void }} [o]
 * @returns {Promise<{ text: string, files: string[] }>}
 */
export async function voice(ws, args, o = {}) {
  const m = await loadManifest(ws);
  if (!existsSync(path.join(ws, 'kit', 'audio', 'voice.py'))) throw new Error("The film's kit predates narration; refresh it: node thesium.mjs sync");
  const specFile = inside(ws, args[0] || 'audio/voice.json');
  const out = inside(ws, args[1] || 'audio/voice.wav');
  if (!existsSync(specFile)) throw new Error(`No ${rel(ws, specFile)}. Write the narration script there: { "voice": "af_heart", "lines": [{ "t": 1.2, "text": "…" }] }`);
  const spec = JSON.parse(await readFile(specFile, 'utf8'));
  const provider = spec.provider || 'kokoro';
  if (!['kokoro', 'system', 'command'].includes(provider)) throw new Error(`provider must be kokoro, system or command; got ${JSON.stringify(provider)}`);
  if (provider === 'command' && typeof spec.command !== 'string') throw new Error('provider "command" needs "command", e.g. "piper -m voice.onnx -f \\"{out}\\"" (text on stdin and in {textFile})');
  /** @type {Line[]} */
  const lines = Array.isArray(spec.lines) ? [...spec.lines].sort((a, b) => a.t - b.t) : [];
  if (!lines.length) throw new Error('The script has no lines');
  const problems = [];
  for (const [i, l] of lines.entries()) {
    if (typeof l.t !== 'number' || l.t < 0 || l.t >= m.duration) problems.push(`line ${i + 1}: t must be seconds from 0 to ${m.duration}`);
    if (!l.file && !(typeof l.text === 'string' && l.text.trim())) problems.push(`line ${i + 1}: needs "text" (or a recorded "file")`);
  }
  if (problems.length) throw new Error(problems.join('\n'));

  const cacheDir = path.join(path.dirname(out), 'voice');
  await mkdir(cacheDir, { recursive: true });
  /** @type {Take[]} */
  const takes = lines.map((line) => {
    const voiceId = line.voice ?? spec.voice ?? (provider === 'kokoro' ? 'af_heart' : '');
    const speed = line.speed ?? spec.speed ?? 1;
    const lang = line.lang ?? spec.lang ?? '';
    const say = line.say ?? line.text ?? '';
    if (line.file) return { line, file: inside(ws, line.file), recorded: true, voice: voiceId, speed, lang, say };
    const key = createHash('sha256')
      .update(JSON.stringify({ provider, voiceId, speed, lang, say, command: provider === 'command' ? spec.command : '' }))
      .digest('hex')
      .slice(0, 16);
    return { line, file: path.join(cacheDir, `${key}.wav`), recorded: false, voice: voiceId, speed, lang, say };
  });
  for (const t of takes) if (t.recorded && !existsSync(t.file)) throw new Error(`Recorded take not found: ${rel(ws, t.file)}`);
  const todo = takes.filter((t) => !t.recorded && !existsSync(t.file));
  if (todo.length) await synthesise(ws, provider, spec, todo, o.log);
  for (const t of takes) t.seconds = (await probe(t.file)).duration;

  // Place every take on the clock, then level the whole narration.
  const raw = `${out}.raw.wav`;
  const d = m.duration;
  const chains = takes.map(
    (t, i) => `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${t.line.gain ?? 0}dB,adelay=delays=${Math.round(t.line.t * 1000)}:all=1[v${i}]`,
  );
  const mix = takes.length > 1 ? `${takes.map((_, i) => `[v${i}]`).join('')}amix=inputs=${takes.length}:normalize=0:duration=longest[m]` : '[v0]anull[m]';
  await ff([...takes.flatMap((t) => ['-i', t.file]), '-filter_complex', `${chains.join(';')};${mix};[m]apad=whole_dur=${d},atrim=0:${d}[o]`, '-map', '[o]', '-ar', '48000', raw]);
  const level = (await loudness(raw)).integratedLufs;
  const gain = level !== undefined && Number.isFinite(level) ? VOICE_LUFS - level : 0;
  await ff(['-i', raw, '-af', `volume=${gain.toFixed(2)}dB`, '-ar', '48000', out]);
  await rm(raw, { force: true });

  const timeline = takes.map((t) => ({ t: t.line.t, end: Number((t.line.t + (t.seconds || 0)).toFixed(3)), text: t.line.text, file: rel(ws, t.file) }));
  const timelineFile = out.replace(/\.wav$/i, '') + '.timeline.json';
  await writeFile(timelineFile, JSON.stringify({ duration: d, lines: timeline }, null, 1));

  const warnings = [];
  // Measured with the hearing check: kokoro-onnx's phonemiser spells Japanese and Mandarin out as
  // language names (18% and 33% of characters heard), and Hindi comes out partly wrong (64%).
  if (provider === 'kokoro') {
    const weak = new Set(takes.filter((t) => !t.recorded && /^[jzh]/.test(t.voice)).map((t) => t.voice));
    if (weak.size)
      warnings.push(`Kokoro speaks ${[...weak].join(', ')} poorly through kokoro-onnx (Japanese and Mandarin barely, Hindi in part); use "provider": "system" or "command" with a native voice for these languages`);
  }
  for (let i = 0; i < timeline.length; i++) {
    const l = timeline[i];
    const next = timeline[i + 1];
    if (next && l.end > next.t + 0.02) warnings.push(`Line at ${l.t} s speaks until ${l.end.toFixed(2)} s, past the next line at ${next.t} s: move the next line or shorten this one`);
    if (l.end > d) warnings.push(`Line at ${l.t} s ends at ${l.end.toFixed(2)} s, after the film ends (${d} s)`);
    const n = l.text ? words(l.text).length : 0;
    const seconds = l.end - l.t;
    // Words a second, or characters for Chinese and Japanese, which are counted one by one.
    const [limit, unit] = l.text && UNSPACED.test(l.text) ? [7, 'characters'] : [3.4, 'words'];
    if (n && seconds > 0 && n / seconds > limit) warnings.push(`Line at ${l.t} s is fast (${(n / seconds).toFixed(1)} ${unit}/s): cut words or lower its speed`);
  }
  const report = [
    `${rel(ws, out)}: ${takes.length} line${takes.length === 1 ? '' : 's'} (${todo.length} spoken now, ${takes.length - todo.length} cached or recorded), levelled to ${VOICE_LUFS} LUFS`,
    ...timeline.map((l) => `  ${l.t.toFixed(2)}–${l.end.toFixed(2)} s  ${l.text ? `"${l.text}"` : l.file}`),
    `Line timings: ${rel(ws, timelineFile)}`,
  ];
  if (warnings.length) report.push('Problems:', ...warnings.map((w) => `  - ${w}`));
  const heard = await hearLines(ws, out, timeline, { language: m.language || (provider === 'kokoro' ? 'en' : undefined) });
  if (heard) {
    report.push(describeHearing(heard));
    // Pronunciation as text: how Kokoro said each word that was not heard cleanly.
    const unclear = [...new Set(heard.lines.flatMap((l) => [...l.missed, ...l.near.map((n) => n[0])]))];
    if (provider === 'kokoro' && unclear.length) {
      const files = await ensureKokoro(o.log);
      const voiceId = spec.voice || 'af_heart';
      const lang = spec.lang || LANG[voiceId[0]] || 'en-us';
      const said = JSON.parse(await py(ws, [path.join(ws, 'kit', 'audio', 'voice.py'), 'phonemes', files.model, files.voices, lang, ...unclear]));
      report.push(`  Kokoro said: ${unclear.map((w) => `${w} /${said[w]}/`).join(', ')}. If one is wrong, respell it in that line's "say".`);
    }
    await mkdir(path.join(ws, 'review'), { recursive: true });
    await writeFile(path.join(ws, 'review', 'voice-heard.json'), JSON.stringify(heard, null, 1));
  } else report.push('Hearing check skipped: pip install faster-whisper to have the narration transcribed and compared with the script.');
  if (m.audio.voice !== rel(ws, out)) report.push(`Declare it: thesium.json → audio.voice = "${rel(ws, out)}"`);
  return { text: report.join('\n'), files: [out, timelineFile] };
}

/** Kokoro's voice ids. @param {string} ws @param {{ log?: (s: string) => void }} [o] */
export async function voices(ws, o = {}) {
  if (!(await hasModule('kokoro_onnx'))) return { text: 'Kokoro is not installed: python -m pip install kokoro-onnx. The "system" provider uses the operating system\'s voices.', files: [] };
  const files = await ensureKokoro(o.log);
  const list = (await py(ws, [path.join(ws, 'kit', 'audio', 'voice.py'), 'voices', files.model, files.voices])).split(/\s+/).filter(Boolean);
  const byLang = {};
  for (const v of list) (byLang[v[0]] ??= []).push(v);
  const names = { a: 'American English', b: 'British English', e: 'Spanish', f: 'French', h: 'Hindi', i: 'Italian', j: 'Japanese', p: 'Brazilian Portuguese', z: 'Mandarin' };
  return {
    text: [
      'Kokoro voices (second letter: f female, m male):',
      ...Object.entries(byLang).map(([k, v]) => `  ${names[k] || k}: ${v.join(' ')}`),
      'Set "voice" in audio/voice.json (all lines) or on a line.',
    ].join('\n'),
    files: [],
  };
}
