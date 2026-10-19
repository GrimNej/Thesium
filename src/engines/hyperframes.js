// hyperframes: HeyGen's HTML-composition renderer (github.com/heygen-com/hyperframes).
// The film is a HyperFrames project in film/hyperframes/ with a paused GSAP timeline.
// Thesium only calls its CLI (snapshot for stills, render for sequences); it bundles nothing of it.
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run } from '../core/proc.js';
import { inside } from '../core/paths.js';
import { filmInfo } from '../core/manifest.js';
import { ensurePackage } from '../core/vendor.js';
import { scan } from './index.js';

const RULES = [
  { pattern: /Math\.random\s*\(/, level: 'error', message: 'Math.random() makes frames unrepeatable; use a seeded generator' },
  { pattern: /\b(Date\.now|performance\.now)\s*\(/, level: 'error', message: 'Wall-clock time breaks seeking' },
  { pattern: /requestAnimationFrame\s*\(|setInterval\s*\(/, level: 'error', message: 'Free-running loops are not seekable; put motion on the paused timeline' },
  { pattern: /(?:src|href)\s*=\s*["']https?:\/\//i, level: 'error', message: 'Remote resources are not allowed; copy files into the project' },
];

/** The command that runs the HyperFrames CLI. */
async function cli() {
  if (process.env.THESIUM_HYPERFRAMES) return { command: process.env.THESIUM_HYPERFRAMES, prefix: [] };
  const exe = process.platform === 'win32' ? 'hyperframes.cmd' : 'hyperframes';
  for (const dir of (process.env.PATH || '').split(path.delimiter))
    if (dir && existsSync(path.join(dir, exe))) return { command: path.join(dir, exe), prefix: [], shell: process.platform === 'win32' };
  return { command: process.platform === 'win32' ? 'npx.cmd' : 'npx', prefix: ['--yes', 'hyperframes@latest'], shell: process.platform === 'win32' };
}

/** @param {string[]} args @param {object} [o] */
async function hf(args, o = {}) {
  const c = await cli();
  return run(c.command, [...c.prefix, ...args], { timeout: 1800000, ...o, ...(c.shell ? { shell: true } : {}) });
}

/** Writes the facts and parameter values the composition reads as window.THESIUM. */
async function writeParams(dir, m, params) {
  await writeFile(path.join(dir, 'thesium-params.js'), `window.THESIUM = ${JSON.stringify(filmInfo(m, params))};\n`);
}

const STARTER = (m) => `<!doctype html>
<html lang="${m.language || 'en'}">
<head>
<meta charset="utf-8">
<script src="./thesium-params.js"></script>
<script src="./gsap.min.js"></script>
<style>
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }
  #film { position: relative; width: 100%; height: 100%; overflow: hidden; }
</style>
</head>
<body>
<div id="film" data-composition-id="film" data-width="${m.width}" data-height="${m.height}" data-duration="${m.duration}" data-fps="${m.fps}">
</div>
<script>
  // A paused GSAP timeline is the film. HyperFrames seeks it; nothing runs on its own clock.
  const tl = gsap.timeline({ paused: true });
  window.__timelines = window.__timelines || {};
  window.__timelines['film'] = tl;
</script>
</body>
</html>
`;

/** @type {import('./index.js').Engine} */
export const hyperframesEngine = {
  id: 'hyperframes',
  label: 'HyperFrames (HTML + GSAP compositions)',
  summary: 'GSAP-timeline HTML films rendered by the HyperFrames CLI',
  guide: 'engines/hyperframes.md',

  async detect() {
    try {
      const { stdout } = await hf(['--version'], { timeout: 180000 });
      return { ok: true, version: stdout.trim().split(/\s+/).pop(), detail: (await cli()).command };
    } catch (error) {
      return { ok: false, detail: `HyperFrames CLI unavailable: ${String(/** @type {Error} */ (error).message).slice(0, 200)}`, fix: 'npm install -g hyperframes (needs Node 22+ and FFmpeg)' };
    }
  },

  async scaffold(workspace, m) {
    const dir = inside(workspace, m.entry);
    await mkdir(dir, { recursive: true });
    const index = path.join(dir, 'index.html');
    if (existsSync(index)) return [];
    await writeFile(index, STARTER(m));
    const gsap = await ensurePackage('gsap', m.engineOptions?.hyperframes?.gsap || 'latest');
    await copyFile(path.join(gsap.dir, 'dist', 'gsap.min.js'), path.join(dir, 'gsap.min.js'));
    await writeParams(dir, m, {});
    return [`${m.entry}/index.html`, `${m.entry}/gsap.min.js`];
  },

  async lint(workspace, m) {
    const dir = inside(workspace, m.entry);
    const index = path.join(dir, 'index.html');
    if (!existsSync(index)) return [{ level: 'error', message: `No ${m.entry}/index.html` }];
    const html = await readFile(index, 'utf8');
    /** @type {import('./index.js').Finding[]} */
    const findings = scan(html, `${m.entry}/index.html`, /** @type {any} */ (RULES));
    const num = (attr) => Number(new RegExp(`data-${attr}="([\\d.]+)"`).exec(html)?.[1]);
    if (num('width') !== m.width || num('height') !== m.height) findings.push({ level: 'error', message: `Root data-width/data-height must be ${m.width}×${m.height}` });
    if (Math.abs(num('duration') - m.duration) > 1e-6) findings.push({ level: 'error', message: `Root data-duration must be ${m.duration}` });
    if (!/__timelines/.test(html)) findings.push({ level: 'error', message: "Register the paused timeline at window.__timelines['film']" });
    try {
      await hf(['lint', dir], { timeout: 300000 });
    } catch (error) {
      findings.push({ level: 'warning', message: `hyperframes lint: ${String(/** @type {Error} */ (error).message).slice(0, 600)}` });
    }
    return findings;
  },

  async open(workspace, m, o) {
    const dir = inside(workspace, m.entry);
    await writeParams(dir, m, o.params);
    const snap = async (times) => {
      const out = await mkdtemp(path.join(os.tmpdir(), 'thesium-hf-'));
      await hf(['snapshot', dir, '--at', times.map((t) => t.toFixed(4)).join(','), '--no-end', '-o', out, '--describe', 'false'], { signal: o.signal });
      const shots = (await readdir(out)).filter((f) => /\.png$/i.test(f)).sort();
      return { out, shots: shots.map((f) => path.join(out, f)) };
    };
    return {
      format: 'png',
      parallel: 1,
      async frame(t) {
        const { out, shots } = await snap([t]);
        const data = await readFile(shots[0]);
        await rm(out, { recursive: true, force: true });
        return data;
      },
      async frames(times, files) {
        const { out, shots } = await snap(times);
        const written = [];
        for (let i = 0; i < times.length; i++) {
          const target = files[i].replace(/\.\w+$/, '.png');
          await rename(shots[i], target).catch(async () => copyFile(shots[i], target));
          written.push(target);
        }
        await rm(out, { recursive: true, force: true });
        return written;
      },
      async sequence({ from, to, fps, dir: target }) {
        if (from > 1e-6 || Math.abs(to - m.duration) > 1e-6) throw Object.assign(new Error('partial'), { partial: true });
        await rm(target, { recursive: true, force: true });
        await hf(['render', dir, '--format', 'png-sequence', '--fps', String(fps), '-o', target, '--quality', 'delivery', '--quiet'], { signal: o.signal, timeout: 6 * 3600000 });
        const files = (await readdir(target)).filter((f) => /\.png$/i.test(f)).sort();
        for (let i = 0; i < files.length; i++) await rename(path.join(target, files[i]), path.join(target, `f_${String(i).padStart(6, '0')}.png`));
        return { pattern: path.join(target, 'f_%06d.png'), format: 'png' };
      },
      async close() {},
    };
  },
};
