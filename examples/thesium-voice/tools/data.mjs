// Builds assets/hearing.json, the numbers this film draws: the narration's and the music's
// loudness envelopes (the music ducked exactly as the master ducks it), the time of every spoken
// word as Whisper heard it, and the phonemes Kokoro spoke for "Thesium".
// Run from the film folder after `node thesium.mjs sound voice`: node tools/data.mjs
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const film = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(film, '..', '..');
const lib = (p) => import(new URL(`file:///${path.join(root, p).replaceAll('\\', '/')}`).href);
const { ff } = await lib('src/media/ffmpeg.js');
const { speechSpans, duckDepth, duckExpression } = await lib('src/media/audio.js');
const { loadManifest } = await lib('src/core/manifest.js');
const { py } = await lib('src/studio/python.js');
const { ensureKokoro, hearLines, words } = await lib('src/studio/voice.js');
const { run } = await lib('src/core/proc.js');

const RATE = 60; // envelope values per second
const m = await loadManifest(film);
const scratch = path.join(film, '.thesium', 'data');
await mkdir(scratch, { recursive: true });

/** Loudness envelope in 0..1 (−60 dBFS..0) at RATE per second. */
async function envelope(file, filter = 'anull') {
  const { buffer } = await run('ffmpeg', ['-v', 'error', '-i', file, '-af', `${filter},aformat=channel_layouts=mono`, '-ar', '12000', '-t', String(m.duration), '-f', 'f32le', '-'], { binary: true, timeout: 120000 });
  const samples = new Float32Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.length / 4));
  const step = 12000 / RATE;
  const out = [];
  for (let i = 0; i + step <= samples.length; i += step) {
    let sum = 0;
    for (let j = i; j < i + step; j++) sum += samples[j] * samples[j];
    const db = 10 * Math.log10(sum / step + 1e-12);
    out.push(Number(Math.min(1, Math.max(0, (db + 60) / 60)).toFixed(3)));
  }
  return out;
}

const voiceFile = path.join(film, m.audio.voice);
const musicFile = path.join(film, m.audio.music);
const spans = await speechSpans(voiceFile, m.duration);
const dip = await duckDepth(film, m, spans, scratch);
const voice = await envelope(voiceFile, `volume=${m.audio.gains.voice}dB`);
const music = await envelope(musicFile, `volume=${m.audio.gains.music}dB`);
const ducked = await envelope(musicFile, `volume=${m.audio.gains.music}dB,asetnsamples=n=480,volume=eval=frame:volume='${duckExpression(spans, dip)}'`);

// Word times: Whisper's words, mapped onto the script's own words (its spelling and punctuation).
const heardFile = path.join(scratch, 'heard.json');
await py(film, [path.join(film, 'kit', 'audio', 'voice.py'), 'hear', voiceFile, heardFile, 'small', 'en', 'Thesium']);
const heard = JSON.parse(await readFile(heardFile, 'utf8')).words;
const timeline = JSON.parse(await readFile(path.join(film, 'audio', 'voice.timeline.json'), 'utf8')).lines;
// Each heard word belongs to the nearest line; Whisper stamps some first words early.
const gap = (w, l) => (w.start < l.t ? l.t - w.start : w.start > l.end ? w.start - l.end : 0);
const nearest = (w) => timeline.reduce((best, l) => (gap(w, l) < gap(w, best) ? l : best), timeline[0]);
const lines = timeline.map((line) => {
  const mine = heard.filter((w) => nearest(w) === line).map((w) => ({ ...w, start: Math.max(w.start, line.t), end: Math.max(w.end, line.t + 0.1) }));
  const tokens = line.text.split(/\s+/);
  let k = 0;
  const timed = tokens.map((token, i) => {
    const want = words(token).join('');
    let got = '';
    const start = mine[k]?.start;
    let end = mine[k]?.end;
    while (k < mine.length && got.length < want.length) {
      got += words(mine[k].word).join('');
      end = mine[k].end;
      k++;
    }
    if (start === undefined || got !== want) {
      // Fall back to an even spread across the line if the transcript and script disagree.
      const span = (line.end - line.t) / tokens.length;
      return { w: token, s: Number((line.t + i * span).toFixed(2)), e: Number((line.t + (i + 1) * span).toFixed(2)), guessed: true };
    }
    return { w: token, s: start, e: end };
  });
  return { t: line.t, end: line.end, text: line.text, words: timed };
});

const kokoro = await ensureKokoro();
const phonemes = JSON.parse(await py(film, [path.join(film, 'kit', 'audio', 'voice.py'), 'phonemes', kokoro.model, kokoro.voices, 'en-us', 'Thesium']));
await rm(scratch, { recursive: true, force: true });

// The hearing check's own result for this narration, for the counter.
const check = await hearLines(film, voiceFile, timeline, { language: 'en' });
const data = { rate: RATE, dip, spans, voice, music, ducked, lines, phonemes: { Thesium: phonemes.Thesium }, heard: { words: check.words, heard: Math.round(check.share * check.words) } };
await writeFile(path.join(film, 'assets', 'hearing.json'), JSON.stringify(data));
const guessed = lines.flatMap((l) => l.words).filter((w) => w.guessed).length;
console.log(`assets/hearing.json: ${voice.length} envelope steps, ${lines.length} lines, ${guessed} words without a heard time, music dips ${dip} dB, heard ${data.heard.heard}/${data.heard.words}`);
