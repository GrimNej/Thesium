import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, parseSize, sampleTimes, resolveParams, frameCount } from '../src/core/manifest.js';
import { inside } from '../src/core/paths.js';
import { inspectFrame } from '../src/review/framecheck.js';
import { scan, stripComments } from '../src/engines/index.js';

test('parseSize understands names and WxH', () => {
  assert.deepEqual(parseSize('16:9'), { width: 1920, height: 1080 });
  assert.deepEqual(parseSize('9:16'), { width: 1080, height: 1920 });
  assert.deepEqual(parseSize('1280x720'), { width: 1280, height: 720 });
  assert.throws(() => parseSize('wide'));
});

test('normalize fills defaults and collects every problem', () => {
  const ok = normalize({ engine: 'effectcraft', width: 1920, height: 1080, duration: 12 });
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.manifest.entry, 'film/build.jsx');
  assert.equal(ok.manifest.fps, 30);
  assert.deepEqual(ok.manifest.motionBlur, { samples: 1, shutter: 0.5 });
  assert.equal(ok.manifest.audio.loudness, -14);
  const bad = normalize({ engine: 'flash', width: 1921, height: 1080, duration: -1, motionBlur: { samples: 0 }, params: { 'bad id': { type: 'x' } } });
  assert.ok(bad.errors.length >= 5, bad.errors.join('\n'));
});

test('motion-blur samples centre on the frame across the shutter', () => {
  assert.deepEqual(sampleTimes(30, 30, 1, 0.5), [1]);
  const s = sampleTimes(30, 30, 4, 0.5);
  assert.equal(s.length, 4);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  assert.ok(Math.abs(mean - 1) < 1e-9);
  assert.ok(Math.max(...s) - Math.min(...s) < 0.5 / 30);
});

test('params resolve defaults, then typed overrides for declared ids only', () => {
  const { manifest } = normalize({
    width: 1920, height: 1080, duration: 5,
    params: { accent: { type: 'color', value: '#112233' }, speed: { type: 'number', value: 1 }, loud: { type: 'boolean', value: false } },
  });
  assert.deepEqual(resolveParams(manifest, { speed: '1.5', loud: 'true', ghost: 3 }), { accent: '#112233', speed: 1.5, loud: true });
  assert.equal(frameCount(manifest), 150);
});

test('inside refuses paths that leave the film folder', () => {
  assert.ok(inside('/films/a', 'assets/x.png').replaceAll('\\', '/').endsWith('/films/a/assets/x.png'));
  assert.throws(() => inside('/films/a', '../b/secret.txt'));
});

test('frame check finds flat frames and edge bands, and passes busy pictures', () => {
  const w = 96, h = 54;
  const frame = (fn) => {
    const rgb = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgb.set(fn(x, y), (y * w + x) * 3);
    return rgb;
  };
  assert.deepEqual(inspectFrame(frame(() => [40, 60, 200]), w, h), ['flat frame (one colour fills the screen)']);
  const noisy = (x, y) => { const v = (x * 37 + y * 91 + ((x * y) % 13) * 17) % 255; return [v, (v * 3) % 255, (v * 7) % 255]; };
  assert.deepEqual(inspectFrame(frame(noisy), w, h), []);
  const banded = inspectFrame(frame((x, y) => (x < 12 ? [0, 0, 0] : noisy(x, y))), w, h);
  assert.ok(banded.some((i) => i.includes('left edge')), banded.join('; '));
});

test('engine rules ignore comments and catch real violations', () => {
  const rules = [{ pattern: /Math\.random\s*\(/, level: 'error', message: 'random' }];
  assert.equal(scan('// Math.random()\nconst x = 1;', 'a.js', /** @type {any} */ (rules)).length, 0);
  assert.equal(scan('const x = Math.random();', 'a.js', /** @type {any} */ (rules)).length, 1);
  assert.equal(stripComments('a /* b */ c // d').trim(), 'a  c');
  assert.equal(stripComments("const u = 'https://x.y/z';").includes('https://x.y/z'), true);
});
