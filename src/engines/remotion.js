// remotion: React components rendered frame by frame (remotion.dev). The film is a Remotion
// project in film/remotion/ whose composition id is "Film". Thesium calls the project's own
// Remotion CLI; it bundles nothing of Remotion. Remotion's license applies to its use.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { run } from '../core/proc.js';
import { inside } from '../core/paths.js';
import { filmInfo } from '../core/manifest.js';
import { scan } from './rules.js';
import { ensureSpace, frameBytes } from '../core/disk.js';

const RULES = [
  { pattern: /Math\.random\s*\(/, level: 'error', message: "Math.random() makes frames unrepeatable; use random(seed) from 'remotion'" },
  { pattern: /\b(Date\.now|performance\.now)\s*\(/, level: 'error', message: 'Wall-clock time breaks rendering; derive everything from useCurrentFrame()' },
  { pattern: /requestAnimationFrame\s*\(|setInterval\s*\(|setTimeout\s*\(/, level: 'error', message: 'Timers are not frame-accurate; use useCurrentFrame()' },
  { pattern: /https?:\/\/(?!www\.w3\.org)[^'"]+\.(png|jpe?g|webp|svg|mp4|mp3|wav|woff2?|ttf)/i, level: 'error', message: "Remote media: put it in public/ and use staticFile()" },
];

/** @param {string} project */
function remotionBin(project) {
  const bin = path.join(project, 'node_modules', '.bin', process.platform === 'win32' ? 'remotion.cmd' : 'remotion');
  return existsSync(bin) ? bin : undefined;
}

const SHELL = process.platform === 'win32';
let sessions = 0;

/**
 * Bundles the project once per state of its sources into .thesium/remotion/<hash>, so stills
 * and sequences skip Remotion's per-call bundling (about 12 s a still on a small film).
 * @param {string} workspace @param {string} dir @param {string} bin @param {AbortSignal} [signal]
 */
async function bundle(workspace, dir, bin, signal) {
  const hash = createHash('sha256');
  const walk = async (d) => {
    const entries = (await readdir(d, { withFileTypes: true }).catch(() => [])).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const f = path.join(d, e.name);
      if (e.isDirectory()) await walk(f);
      else {
        const s = await stat(f);
        hash.update(`${path.relative(dir, f)}:${s.size}:${s.mtimeMs}\n`);
      }
    }
  };
  await walk(dir);
  const root = path.join(workspace, '.thesium', 'remotion');
  const out = path.join(root, hash.digest('hex').slice(0, 16));
  if (existsSync(path.join(out, 'index.html'))) return out;
  await rm(out, { recursive: true, force: true });
  await run(bin, ['bundle', 'src/index.tsx', `--out-dir=${out}`, '--log=error'], { cwd: dir, timeout: 600000, signal, shell: SHELL });
  for (const old of await readdir(root).catch(() => []))
    if (path.join(root, old) !== out) await rm(path.join(root, old), { recursive: true, force: true }).catch(() => {});
  return out;
}

const PACKAGE = (m) =>
  JSON.stringify(
    {
      name: m.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'film',
      private: true,
      scripts: { studio: 'remotion studio' },
      dependencies: { remotion: '^4.0.0', '@remotion/cli': '^4.0.0', react: '^19.0.0', 'react-dom': '^19.0.0' },
    },
    null,
    2,
  );

const ROOT_TSX = (m) => `import { Composition, getInputProps, registerRoot } from 'remotion';
import { Film } from './Film';

// Thesium passes the film's facts and tuned parameters as input props (THESIUM). For motion blur it
// can ask for more frames per second than the film has (thesium.renderFps): Film derives time from
// useVideoConfig().fps, so the extra frames are exact sub-frame times.
type Thesium = { renderFps?: number; [key: string]: unknown };
const thesium = (getInputProps() as { THESIUM?: Thesium }).THESIUM ?? {};
const fps = thesium.renderFps ?? ${m.fps};

const Root = () => (
  <Composition
    id="Film"
    component={Film}
    width={${m.width}}
    height={${m.height}}
    fps={fps}
    durationInFrames={Math.round(${m.duration} * fps)}
    defaultProps={{ thesium }}
  />
);

registerRoot(Root);
`;

const FILM_TSX = `import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';

// Everything on screen derives from the frame. See the Remotion engine guide.
export const Film = ({ thesium }: { thesium: Record<string, unknown> }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  return <AbsoluteFill style={{ background: '#000' }} />;
};
`;

/** @type {import('./index.js').Engine} */
export const remotionEngine = {
  id: 'remotion',
  label: 'Remotion (React)',
  summary: 'React component films; long, many-scene pieces with reusable parts',
  guide: 'engines/remotion.md',

  async detect() {
    try {
      const { stdout } = await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['view', '@remotion/cli', 'version'], { timeout: 30000, shell: process.platform === 'win32' });
      return { ok: true, version: stdout.trim(), detail: 'Remotion is installed per film: npm install in film/remotion' };
    } catch {
      return { ok: false, detail: 'npm is not available to install Remotion', fix: 'Install Node.js with npm' };
    }
  },

  async scaffold(workspace, m) {
    const dir = inside(workspace, m.entry);
    await mkdir(path.join(dir, 'src'), { recursive: true });
    await mkdir(path.join(dir, 'public'), { recursive: true });
    const files = [];
    const put = async (rel, text) => {
      const file = path.join(dir, rel);
      if (existsSync(file)) return;
      await writeFile(file, text);
      files.push(`${m.entry}/${rel}`);
    };
    await put('package.json', PACKAGE(m));
    await put('src/index.tsx', ROOT_TSX(m));
    await put('src/Film.tsx', FILM_TSX);
    return files;
  },

  async lint(workspace, m) {
    const dir = inside(workspace, m.entry);
    /** @type {import('./index.js').Finding[]} */
    const findings = [];
    if (!existsSync(path.join(dir, 'src', 'index.tsx'))) findings.push({ level: 'error', message: `No ${m.entry}/src/index.tsx registering the composition "Film"` });
    if (!remotionBin(dir)) findings.push({ level: 'error', message: `Remotion is not installed: run npm install in ${m.entry}` });
    const walk = async (d) => {
      for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const f = path.join(d, e.name);
        if (e.isDirectory()) await walk(f);
        else if (/\.(tsx?|jsx?)$/.test(e.name)) findings.push(...scan(await readFile(f, 'utf8'), path.relative(workspace, f).replaceAll('\\', '/'), /** @type {any} */ (RULES)));
      }
    };
    await walk(path.join(dir, 'src'));
    if (m.motionBlur.samples > 1 && !(await readFile(path.join(dir, 'src', 'index.tsx'), 'utf8').catch(() => '')).includes('renderFps'))
      findings.push({ level: 'warning', message: 'motionBlur.samples needs src/index.tsx to take its fps from thesium.renderFps (see the Remotion guide); otherwise masters fall back to one still per sample' });
    return findings;
  },

  async open(workspace, m, o) {
    const dir = inside(workspace, m.entry);
    const bin = remotionBin(dir);
    if (!bin) throw new Error(`Remotion is not installed in ${m.entry}. Run: npm install (in ${m.entry})`);
    const base = path.join(workspace, '.thesium', `remotion-props-${process.pid}-${sessions++}`);
    await mkdir(path.dirname(base), { recursive: true });
    const info = filmInfo(m, o.params);
    // Sub-frame times (motion blur) need a project whose Root reads thesium.renderFps.
    const sampled = (await readFile(path.join(dir, 'src', 'index.tsx'), 'utf8').catch(() => '')).includes('renderFps');
    /** @type {Map<number, string>} */
    const propsFiles = new Map();
    const propsAt = async (rate) => {
      if (!propsFiles.has(rate)) {
        const file = `${base}-${rate}.json`;
        await writeFile(file, JSON.stringify({ THESIUM: rate === m.fps ? info : { ...info, renderFps: rate } }));
        propsFiles.set(rate, file);
      }
      return /** @type {string} */ (propsFiles.get(rate));
    };
    const scale = o.scale && o.scale > 0 ? o.scale : 1;
    const gl = m.engineOptions?.remotion?.gl ? [`--gl=${m.engineOptions.remotion.gl}`] : [];
    const served = await bundle(workspace, dir, bin, o.signal);
    const common = async (rate) => [`--props=${await propsAt(rate)}`, `--scale=${scale}`, '--log=error', ...gl];
    const rm_ = (p) => rm(p, { recursive: true, force: true });
    /** The lowest rate (film fps × 1, 2, 4 … 64) that has a frame exactly at t. */
    const rateFor = (t) => {
      if (!sampled) return m.fps;
      for (const k of [1, 2, 4, 8, 16, 32, 64]) if (Math.abs(t * m.fps * k - Math.round(t * m.fps * k)) < 1e-4) return m.fps * k;
      return m.fps;
    };
    const still = async (t, out) => {
      const rate = rateFor(t);
      const frame = Math.min(Math.round(m.duration * rate) - 1, Math.max(0, Math.round(t * rate)));
      await run(bin, ['still', served, 'Film', out, `--frame=${frame}`, '--image-format=png', ...(await common(rate))], { cwd: dir, timeout: 600000, signal: o.signal, shell: SHELL });
    };
    let n = 0;
    return {
      format: 'png',
      parallel: Math.max(1, Math.min(3, Number(m.engineOptions?.remotion?.parallel) || 2)),
      async frame(t) {
        const out = path.join(workspace, '.thesium', `remotion-${process.pid}-${n++}.png`);
        await still(t, out);
        const data = await readFile(out);
        await rm_(out);
        return data;
      },
      async sequence({ from, to, fps, dir: target, onProgress }) {
        if (Math.abs(fps - m.fps) > 1e-6 && !sampled) throw Object.assign(new Error('This Root renders whole frames only'), { partial: true });
        await rm_(target);
        const a = Math.round(from * fps);
        const b = Math.round(to * fps) - 1;
        // JPEG at quality 95, not PNG: motion-blur sequences run to thousands of frames.
        await ensureSpace(target, (b - a + 1) * frameBytes('jpeg', m.width * scale, m.height * scale), 'The Remotion sequence');
        await run(bin, ['render', served, 'Film', target, '--sequence', '--image-format=jpeg', '--jpeg-quality=95', `--frames=${a}-${b}`, ...(await common(fps))], {
          cwd: dir,
          timeout: 6 * 3600000,
          signal: o.signal,
          shell: SHELL,
          onLine: (line) => {
            const mm = /(\d+)\s*\/\s*(\d+)/.exec(line);
            if (mm) onProgress?.(Number(mm[1]), Number(mm[2]));
          },
        });
        const files = (await readdir(target)).filter((f) => /\.jpe?g$/i.test(f)).sort();
        for (let i = 0; i < files.length; i++) await rename(path.join(target, files[i]), path.join(target, `f_${String(i).padStart(6, '0')}.jpg`));
        return { pattern: path.join(target, 'f_%06d.jpg'), format: 'jpeg' };
      },
      async close() {
        for (const file of propsFiles.values()) await rm_(file);
      },
    };
  },
};
