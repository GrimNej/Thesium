// remotion: React components rendered frame by frame (remotion.dev). The film is a Remotion
// project in film/remotion/ whose composition id is "Film". Thesium calls the project's own
// Remotion CLI; it bundles nothing of Remotion. Remotion's license applies to its use.
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { run } from '../core/proc.js';
import { inside } from '../core/paths.js';
import { filmInfo } from '../core/manifest.js';
import { scan } from './index.js';

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

// Thesium passes the film's facts and tuned parameters as input props (THESIUM).
const thesium = (getInputProps() as { THESIUM?: Record<string, unknown> }).THESIUM ?? {};

const Root = () => (
  <Composition
    id="Film"
    component={Film}
    width={${m.width}}
    height={${m.height}}
    fps={${m.fps}}
    durationInFrames={${Math.round(m.duration * m.fps)}}
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
    if (m.motionBlur.samples > 1) findings.push({ level: 'warning', message: 'Remotion renders whole frames; use <CameraMotionBlur> from @remotion/motion-blur instead of motionBlur.samples' });
    return findings;
  },

  async open(workspace, m, o) {
    const dir = inside(workspace, m.entry);
    const bin = remotionBin(dir);
    if (!bin) throw new Error(`Remotion is not installed in ${m.entry}. Run: npm install (in ${m.entry})`);
    const props = path.join(workspace, '.thesium', 'remotion-props.json');
    await mkdir(path.dirname(props), { recursive: true });
    await writeFile(props, JSON.stringify({ THESIUM: filmInfo(m, o.params) }));
    const scale = o.scale && o.scale > 0 ? o.scale : 1;
    const common = [`--props=${props}`, `--scale=${scale}`, '--log=error'];
    const rm_ = (p) => rm(p, { recursive: true, force: true });
    const frameOf = (t) => Math.min(Math.round(m.duration * m.fps) - 1, Math.max(0, Math.round(t * m.fps)));
    const still = async (t, out) => {
      await run(bin, ['still', 'src/index.tsx', 'Film', out, `--frame=${frameOf(t)}`, '--image-format=png', ...common], { cwd: dir, timeout: 600000, signal: o.signal, shell: process.platform === 'win32' });
    };
    let n = 0;
    return {
      format: 'png',
      parallel: 1,
      async frame(t) {
        const out = path.join(workspace, '.thesium', `remotion-${process.pid}-${n++}.png`);
        await still(t, out);
        const data = await readFile(out);
        await rm_(out);
        return data;
      },
      async sequence({ from, to, fps, dir: target, onProgress }) {
        if (Math.abs(fps - m.fps) > 1e-6) throw Object.assign(new Error('Remotion renders whole frames only'), { partial: true });
        await rm_(target);
        const a = Math.round(from * m.fps);
        const b = Math.round(to * m.fps) - 1;
        await run(bin, ['render', 'src/index.tsx', 'Film', target, '--sequence', '--image-format=png', `--frames=${a}-${b}`, ...common], {
          cwd: dir,
          timeout: 6 * 3600000,
          signal: o.signal,
          shell: process.platform === 'win32',
          onLine: (line) => {
            const mm = /(\d+)\s*\/\s*(\d+)/.exec(line);
            if (mm) onProgress?.(Number(mm[1]), Number(mm[2]));
          },
        });
        const files = (await readdir(target)).filter((f) => /\.png$/i.test(f)).sort();
        for (let i = 0; i < files.length; i++) await rename(path.join(target, files[i]), path.join(target, `f_${String(i).padStart(6, '0')}.png`));
        return { pattern: path.join(target, 'f_%06d.png'), format: 'png' };
      },
      async close() {},
    };
  },
};
