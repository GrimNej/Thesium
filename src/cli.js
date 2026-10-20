// The thesium command. Every command works on the film folder given by --workspace, or the
// nearest folder (upward from here) that holds a thesium.json.
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { parseSize, loadManifest, saveManifest } from './core/manifest.js';
import { createFilm, findWorkspace, syncWorkspace, recordInstall } from './core/workspace.js';
import { KNOWLEDGE_DIR, ROOT } from './core/paths.js';
import { ENGINES, engine } from './engines/index.js';
import * as ops from './studio/ops.js';

const HELP = `thesium: an engine-agnostic motion studio for frontier models

Film
  make "<request>" [--engine …] [--size …] [--duration 30] [--folder name] [--model …] [--dry-run]
                                 one command: a film folder, then a headless director session (Claude Code)
  make --continue --folder <name>
                                 resume a director session that stopped (a usage limit, a closed terminal)
  new <folder> [--engine web|effectcraft|remotion|hyperframes|command] [--size 16:9|9:16|1:1|WxH]
               [--fps 30] [--duration 15] [--title "…"] [--brief "…"] [--language en]
  status                         where the film stands and what to do next
  sync                           refresh the film's kit, launcher and house rules

Look
  build                          compile the source when the engine needs it (EffectCraft)
  still <t> [t…] [--phone] [--sharp]
                                 exact frames → review/still-<t>.jpg (--phone adds 360 px copies)
  strip <t> [--count 12] [--step 1] [--sharp]
                                 neighbouring frames (step in frames) → review/strip-<t>.jpg
  preview [--scale 0.5] [--from s] [--to s] [--step s] [--blur]
                                 fast low-res film + sheets + frame check → review/preview*
  check [--fast]                 contract, engine rules, language and determinism → PASS/FAIL
  frames <video> [--fps 30] [--key green] [--width px]
                                 frame-accurate (optionally keyed) sequence → assets/frames/<name>/
  capture <url> [--images 24]    screenshots, text, brand cues and images of a page → assets/capture/<page>/
  qr "<url>" [--out assets/qr.png|.svg] [--size 600] [--dark #000] [--light #fff]
                                 a real, scannable QR code for a call to action

Sound (Python 3 with numpy and scipy)
  sound score <script.py>        run a score script with the kit's synth on its path
  sound sfx [audio/sfx.json] [audio/sfx.wav]
                                 synthesize an SFX timeline
  sound voice [audio/voice.json] [audio/voice.wav]
                                 narration: timed lines spoken locally (Kokoro, the system voice,
                                 any TTS command or recorded takes), then transcribed and compared
                                 with the script when faster-whisper is installed
  sound voices                   Kokoro's voice ids
  sound beats <audio>            tempo, beats, downbeats, hits → audio/beats.json
  sound check <audio>            loudness, peak, balance, waveform and spectrum → review/

Deliver
  master [--draft]               full render, mixed and mastered sound, QA → out/<title>-v<N>.mp4
  review                         evidence for the independent critic → review/critic/<version>/
  notes [--done <id>|all]        the person's notes from the studio
  studio [--port 4700] [--no-open]
                                 the review studio: play, pin notes, tune parameters

More
  doctor                         check FFmpeg, Python and every engine
  engines                        list engines and their guides
  guide [engine]                 print an engine guide (default: this film's)
  fonts                          font families the film's engine can use
  effects [filter]               EffectCraft effects and their parameter ids (one effect: full detail)
  add <library>[@version]        pin three, gsap or p5 for a web film (fetched once, served offline)
  mcp                            run as an MCP server over stdio

Options: --workspace <folder>, --param name=value (repeatable; overrides a tunable for this run)
`;

/** @param {string[]} argv */
function parse(argv) {
  /** @type {string[]} */
  const positional = [];
  /** @type {Record<string, string | boolean>} */
  const flags = {};
  /** @type {Record<string, string>} */
  const params = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--param' || a === '-p') {
      const [k, ...v] = String(argv[++i] || '').split('=');
      if (k) params[k] = v.join('=');
    } else if (a.startsWith('--')) {
      const [key, inline] = a.slice(2).split('=');
      const next = argv[i + 1];
      if (inline !== undefined) flags[key] = inline;
      else if (next !== undefined && !next.startsWith('--') && !BOOLEAN.has(key)) flags[key] = argv[++i];
      else flags[key] = true;
    } else positional.push(a);
  }
  return { positional, flags, params };
}

const BOOLEAN = new Set(['phone', 'sharp', 'blur', 'draft', 'fast', 'no-open', 'json', 'help', 'dry-run', 'continue']);

/** @param {string | boolean | undefined} v @param {number} [fallback] */
const num = (v, fallback) => (v === undefined || v === true ? fallback : Number(v));

const progress = (label) => {
  let last = 0;
  return (done, total) => {
    if (Date.now() - last > 2500 || done === total) {
      last = Date.now();
      process.stdout.write(`${label} ${done}/${total}\n`);
    }
  };
};
const log = (line) => process.stdout.write(`  ${line}\n`);

/**
 * Runs a command. Returns the process exit code.
 * @param {string[]} argv
 */
export async function main(argv) {
  const { positional, flags, params } = parse(argv);
  const [command, ...args] = positional;
  const workspace = () => findWorkspace(typeof flags.workspace === 'string' ? flags.workspace : undefined);
  try {
    switch (command) {
      case undefined:
      case 'help':
        process.stdout.write(HELP);
        return 0;
      case 'make': {
        const { make } = await import('./studio/make.js');
        const size = parseSize(String(flags.size || '16:9'));
        return await make(args.join(' '), {
          folder: typeof flags.folder === 'string' ? flags.folder : undefined,
          engine: typeof flags.engine === 'string' ? flags.engine : undefined,
          ...size,
          fps: num(flags.fps),
          duration: num(flags.duration, 30),
          title: typeof flags.title === 'string' ? flags.title : undefined,
          model: typeof flags.model === 'string' ? flags.model : undefined,
          permissionMode: typeof flags['permission-mode'] === 'string' ? flags['permission-mode'] : undefined,
          dryRun: Boolean(flags['dry-run']),
          resume: Boolean(flags.continue),
          cwd: typeof flags.workspace === 'string' ? flags.workspace : undefined,
        });
      }
      case 'new': {
        if (!args[0]) throw new Error('Usage: thesium new <folder> [--engine …] [--size …] [--duration …]');
        const size = parseSize(String(flags.size || '16:9'));
        const dir = path.resolve(typeof flags.workspace === 'string' ? flags.workspace : process.cwd(), args[0]);
        const engineId = String(flags.engine || 'web');
        engine(engineId);
        const ws = await createFilm(dir, {
          engine: engineId,
          ...size,
          fps: num(flags.fps, 30),
          duration: num(flags.duration, 15),
          title: typeof flags.title === 'string' ? flags.title : undefined,
          brief: typeof flags.brief === 'string' ? flags.brief : undefined,
          language: typeof flags.language === 'string' ? flags.language : undefined,
        });
        const m = await loadManifest(ws);
        const files = await engine(m.engine).scaffold(ws, m);
        console.log(`Created ${ws}`);
        console.log(`  ${['thesium.json', 'BRIEF.md', 'PLAN.md', 'timeline.json', ...files].join('\n  ')}`);
        console.log(`Engine guide: ${path.join(KNOWLEDGE_DIR, engine(m.engine).guide).replaceAll('\\', '/')}`);
        console.log(`From the film folder: node thesium.mjs status`);
        return 0;
      }
      case 'sync': {
        const ws = workspace();
        const m = await syncWorkspace(ws);
        console.log(`Synced ${ws} (${m.engine}): kit, launcher and house rules are current.`);
        return 0;
      }
      case 'status':
        return print(await ops.status(workspace()));
      case 'doctor':
        await recordInstall();
        return print(await ops.doctor(), true);
      case 'engines': {
        for (const e of Object.values(ENGINES)) {
          const d = await e.detect().catch(() => ({ ok: false, detail: '' }));
          console.log(`${d.ok ? 'ok  ' : 'miss'}  ${e.id.padEnd(12)} ${e.summary}\n      guide: ${path.join(KNOWLEDGE_DIR, e.guide).replaceAll('\\', '/')}`);
        }
        return 0;
      }
      case 'guide': {
        const id = args[0] || (await loadManifest(workspace())).engine;
        process.stdout.write(await readFile(path.join(KNOWLEDGE_DIR, engine(id).guide), 'utf8'));
        return 0;
      }
      case 'build':
        return print(await ops.build(workspace(), { params, log }));
      case 'still': {
        const times = args.map(Number).filter(Number.isFinite);
        return print(await ops.still(workspace(), times, { phone: Boolean(flags.phone), sharp: Boolean(flags.sharp), params, log }));
      }
      case 'strip':
        return print(await ops.strip(workspace(), Number(args[0]), { count: num(flags.count), step: num(flags.step), sharp: Boolean(flags.sharp), log }));
      case 'preview':
        return print(
          await ops.preview(workspace(), {
            scale: num(flags.scale),
            from: num(flags.from),
            to: num(flags.to),
            step: num(flags.step),
            blur: Boolean(flags.blur),
            log,
            onProgress: progress('frames'),
          }),
        );
      case 'check':
        return print(await ops.check(workspace(), { fast: Boolean(flags.fast), log }), true);
      case 'master':
        return print(await ops.master(workspace(), { draft: Boolean(flags.draft), log, onProgress: progress('frames') }));
      case 'review':
        return print(await ops.reviewPackage(workspace()));
      case 'capture': {
        const { capture } = await import('./studio/capture.js');
        if (!args[0]) throw new Error('Usage: capture <url> [--images 24]');
        return print(await capture(workspace(), args[0], { images: num(flags.images), log }));
      }
      case 'qr': {
        const { qr } = await import('./studio/qr.js');
        return print(
          await qr(workspace(), args.join(' '), {
            out: typeof flags.out === 'string' ? flags.out : undefined,
            size: num(flags.size),
            dark: typeof flags.dark === 'string' ? flags.dark : undefined,
            light: typeof flags.light === 'string' ? flags.light : undefined,
          }),
        );
      }
      case 'frames':
        if (!args[0]) throw new Error('Usage: frames <video> [--fps 30] [--key green|blue|#rrggbb] [--width px] [--name id]');
        return print(
          await ops.extractFrames(workspace(), args[0], {
            fps: num(flags.fps),
            key: typeof flags.key === 'string' ? flags.key : undefined,
            width: num(flags.width),
            name: typeof flags.name === 'string' ? flags.name : undefined,
          }),
        );
      case 'notes':
        return print(await ops.notes(workspace(), { done: flags.done ? [String(flags.done), ...args] : undefined }));
      case 'sound': {
        const { sound } = await import('./studio/sound.js');
        return print(await sound(workspace(), args[0], args.slice(1), { log }));
      }
      case 'fonts': {
        const ws = workspace();
        const m = await loadManifest(ws);
        if (m.engine === 'effectcraft') {
          const { listFonts } = await import('./engines/effectcraft.js');
          for (const f of await listFonts(ws)) console.log(`${f.family}: ${f.styles.join(', ')}`);
        } else console.log(await readFile(path.join(ROOT, 'fonts', 'README.md'), 'utf8'));
        return 0;
      }
      case 'effects': {
        const { listEffects } = await import('./engines/effectcraft.js');
        const filter = args.join(' ');
        let found = await listEffects(filter);
        const exact = found.filter((e) => e.name.toLowerCase() === filter.toLowerCase());
        if (exact.length) found = exact;
        if (!found.length) console.log('No effect matches. Run without a filter for the full list.');
        const detailed = found.length <= 6;
        for (const e of found) {
          if (!detailed) {
            console.log(`${e.category.padEnd(18)} ${e.name}`);
            continue;
          }
          console.log(`\n${e.name}  (${e.category})  T.fx(layer, "${e.name}", { … })`);
          for (const p of e.params) {
            const range = p.min !== undefined ? ` ${p.min}…${p.max}` : '';
            const options = p.options ? ` ${p.options.map((x) => `${x.value}=${x.label}`).join(', ')}` : '';
            console.log(`  ${p.id.padEnd(34)} ${String(p.type).padEnd(7)} default ${JSON.stringify(p.default)}${range}${options}`);
          }
        }
        return 0;
      }
      case 'add': {
        const ws = workspace();
        const m = await loadManifest(ws);
        const [name, version] = String(args[0] || '').split('@');
        const { ensurePackage, LIBRARIES } = await import('./core/vendor.js');
        if (!(name in LIBRARIES)) throw new Error(`Known libraries: ${Object.keys(LIBRARIES).join(', ')}`);
        const pkg = await ensurePackage(name, version || 'latest');
        m.engineOptions.web = { ...(m.engineOptions.web || {}), vendor: { ...(m.engineOptions.web?.vendor || {}), [name]: pkg.version } };
        await saveManifest(ws, m);
        console.log(`${name}@${pkg.version} ${pkg.downloaded ? 'downloaded' : 'already cached'} → /vendor/${name}/ (${LIBRARIES[/** @type {'three'} */ (name)].note})`);
        return 0;
      }
      case 'studio': {
        const { startStudio } = await import('./studio/server.js');
        const s = await startStudio(workspace(), { port: num(flags.port, 4700), open: !flags['no-open'] });
        console.log(`Thesium studio for ${s.title}: ${s.url}\nPress Ctrl+C to stop.`);
        await new Promise(() => {});
        return 0;
      }
      case 'mcp': {
        const { serveMcp } = await import('./mcp/server.js');
        await serveMcp();
        return 0;
      }
      default:
        throw new Error(`Unknown command "${command}". Run: thesium help`);
    }
  } catch (error) {
    console.error(`thesium: ${/** @type {Error} */ (error).message}`);
    return 1;
  }
}

/** @param {{ text: string, ok?: boolean }} result @param {boolean} [strict] fail when ok is false */
function print(result, strict = false) {
  console.log(result.text);
  return strict && result.ok === false ? 1 : 0;
}
