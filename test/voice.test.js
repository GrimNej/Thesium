import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compareWords, eitherHeard, words } from '../src/studio/voice.js';
import { duckExpression, narrationBalance, speechSpans, VOICE_OVER_MUSIC } from '../src/media/audio.js';
import { ff, probe } from '../src/media/ffmpeg.js';
import { loadManifest } from '../src/core/manifest.js';
import { sound } from '../src/studio/sound.js';
import { main } from '../src/cli.js';

const quiet = async (fn) => {
  const log = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
  }
};

test('the hearing check aligns words, allows near misses and merges two listeners', () => {
  const said = words('Thesium sees every frame it makes.');
  assert.deepEqual(said, ['thesium', 'sees', 'every', 'frame', 'it', 'makes']);
  const plain = compareWords(said, words('These EMCs every frame it makes'));
  assert.equal(plain.matched, 4);
  assert.deepEqual(plain.missed, ['thesium', 'sees']);
  const named = compareWords(said, words('Theseum sees every frame makes'));
  assert.deepEqual(named.near, [['thesium', 'theseum']]);
  assert.deepEqual(named.missed, ['it']);
  const either = eitherHeard(plain, named);
  assert.equal(either.matched + either.near.length, said.length);
});

test('speech spans come from silences, and the duck eases around them', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'thesium-voice-'));
  try {
    const file = path.join(dir, 'speech.wav');
    await ff([
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
      '-filter_complex', '[0]adelay=delays=500:all=1[a];[1]adelay=delays=3000:all=1[b];[a][b]amix=inputs=2:normalize=0,apad',
      '-t', '5',
      file,
    ]);
    const spans = await speechSpans(file, 5);
    assert.equal(spans.length, 2, JSON.stringify(spans));
    for (const [[a, b], [x, y]] of spans.map((s, i) => [s, [[0.5, 1.5], [3, 4]][i]])) {
      assert.ok(Math.abs(a - x) < 0.06 && Math.abs(b - y) < 0.06, JSON.stringify(spans));
    }
    const expr = duckExpression([[1, 2]], 6);
    assert.match(expr, /^\(1-0\.4988\*clip\(min\(\(t-0\.800\)\/0\.2,\(2\.350-t\)\/0\.35\),0,1\)\)$/);
    assert.equal(duckExpression([], 6), '1');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('narration places timed lines, caches takes, reports overlaps and auto-ducks the music', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'thesium-voice-'));
  const film = path.join(dir, 'film');
  process.env.THESIUM_HEARING = '0';
  try {
    assert.equal(await quiet(() => main(['new', film, '--engine', 'web', '--size', '640x360', '--duration', '6', '--title', 'Voice'])), 0);
    // A stand-in text-to-speech command: a 1.2 s tone per line.
    await writeFile(
      path.join(film, 'audio', 'voice.json'),
      JSON.stringify({
        provider: 'command',
        command: 'ffmpeg -v error -y -f lavfi -i sine=frequency=330:duration=1.2 "{out}"',
        lines: [
          { t: 0.5, text: 'The first line.' },
          { t: 1.2, text: 'The second line comes in too early.' },
        ],
      }),
    );
    const first = await sound(film, 'voice', []);
    assert.match(first.text, /2 spoken now/);
    assert.match(first.text, /past the next line at 1\.2 s/);
    const timeline = JSON.parse(await readFile(path.join(film, 'audio', 'voice.timeline.json'), 'utf8'));
    assert.ok(Math.abs(timeline.lines[0].end - 1.7) < 0.05, JSON.stringify(timeline));
    assert.ok(Math.abs((await probe(path.join(film, 'audio', 'voice.wav'))).duration - 6) < 0.05);
    assert.match((await sound(film, 'voice', [])).text, /0 spoken now/);

    // A loud bed: auto ducking puts the voice VOICE_OVER_MUSIC LU above it while it speaks.
    await ff(['-f', 'lavfi', '-i', 'sine=frequency=110:duration=6', '-af', 'volume=6dB', path.join(film, 'audio', 'music.wav')]);
    const manifest = JSON.parse(await readFile(path.join(film, 'thesium.json'), 'utf8'));
    manifest.audio = { ...manifest.audio, music: 'audio/music.wav', voice: 'audio/voice.wav' };
    await writeFile(path.join(film, 'thesium.json'), JSON.stringify(manifest));
    const balance = await narrationBalance(film, await loadManifest(film), dir);
    assert.ok(balance && balance.auto && balance.dip > 0, JSON.stringify(balance));
    assert.ok(Math.abs(balance.lu - VOICE_OVER_MUSIC) < 1, JSON.stringify(balance));
    assert.ok(existsSync(path.join(film, 'audio', 'voice')));
  } finally {
    delete process.env.THESIUM_HEARING;
    await rm(dir, { recursive: true, force: true });
  }
});
