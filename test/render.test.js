import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { nativeSampling } from '../src/render/frames.js';
import { run } from '../src/core/proc.js';
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

test('native motion-blur samples sit inside the shutter, centred on the frame', () => {
  for (const [samples, shutter, maxFps] of [[8, 0.5, Infinity], [8, 0.5, 240], [4, 1, Infinity], [16, 0.25, Infinity]]) {
    const p = nativeSampling(30, samples, shutter, maxFps);
    const offsets = Array.from({ length: p.window }, (_, i) => (p.last - p.window + 1 + i) / p.perFrame);
    const what = JSON.stringify({ samples, shutter, maxFps, p, offsets });
    assert.ok(30 * p.perFrame <= maxFps, what);
    assert.ok(Math.max(...offsets.map(Math.abs)) <= shutter / 2 + 1e-9, what);
    assert.ok(Math.abs(offsets.reduce((a, b) => a + b, 0) / offsets.length) <= 0.5 / p.perFrame + 1e-9, what);
  }
  assert.deepEqual(nativeSampling(30, 1, 0.5), { perFrame: 1, window: 1, last: 0 });
});

test('a native sequence with motion blur keeps frame-locked drawing sharp', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'thesium-blur-'));
  const film = path.join(dir, 'film');
  try {
    assert.equal(await quiet(() => main(['new', film, '--engine', 'command', '--size', '320x180', '--duration', '1', '--title', 'Blur'])), 0);
    const manifest = JSON.parse(await readFile(path.join(film, 'thesium.json'), 'utf8'));
    manifest.motionBlur = { samples: 8, shutter: 0.5 };
    // A box that jumps 8 px each frame, like a readout drawn at frameTime(t): every sample of one
    // frame shows it in the same place, so the averaged frame must show one crisp box, not two.
    // (overlay evaluates x per frame with t = time; drawbox's t is its thickness.)
    const box = `[0][1]overlay=x='8*floor(t*30+0.5)':y=60:eval=frame`;
    manifest.engineOptions.command = {
      frame: `ffmpeg -v error -y -f lavfi -i color=c=black:s={width}x{height}:d=1 -vf "drawbox=x=8*{frame}:y=60:w=6:h=60:color=white:t=fill" -frames:v 1 "{out}"`,
      sequence: `ffmpeg -v error -y -f lavfi -i color=c=black:s={width}x{height}:r={fps}:d=1 -f lavfi -i color=c=white:s=6x60:r={fps}:d=1 -filter_complex "${box}" "{dir}/f_%06d.png"`,
    };
    await writeFile(path.join(film, 'thesium.json'), JSON.stringify(manifest));
    await quiet(() => main(['--workspace', film, 'master']));
    const master = path.join(film, 'out', 'blur-v1.mp4');
    assert.ok(existsSync(master));
    const { buffer } = await run('ffmpeg', ['-v', 'error', '-ss', '0.5', '-i', master, '-frames:v', '1', '-vf', 'crop=320:1:0:90,format=gray', '-f', 'rawvideo', '-'], { binary: true });
    const row = [...buffer];
    const lit = row.map((v, x) => [x, v]).filter(([, v]) => v > 60).map(([x]) => x);
    assert.ok(lit.length > 0 && Math.max(...row) > 180, `no bright box at 0.5 s: ${row.join(',')}`);
    assert.ok(Math.min(...lit) >= 116 && Math.max(...lit) <= 130, `the box is smeared or doubled at 0.5 s (lit columns ${lit.join(',')})`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
