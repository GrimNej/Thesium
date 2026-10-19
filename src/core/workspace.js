// A film workspace: one folder per film, self-contained, readable by any agent.
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KIT_DIR, KNOWLEDGE_DIR, LAYOUT, ROOT } from './paths.js';
import { DEFAULT_ENTRY, normalize, saveManifest, loadManifest } from './manifest.js';

const exists = (file) => stat(file).then(() => true, () => false);

/** Records where this Thesium lives, so film launchers find it after the install moves. */
export async function recordInstall() {
  const dir = path.join(os.homedir(), '.thesium');
  const file = path.join(dir, 'install.json');
  const current = await readFile(file, 'utf8').then(JSON.parse, () => ({}));
  if (current.root === ROOT) return;
  await mkdir(dir, { recursive: true });
  await writeFile(file, JSON.stringify({ root: ROOT, at: new Date().toISOString() }, null, 2));
}

/** The launcher placed in every film: `node thesium.mjs <command>` works from any shell. */
const launcher = () => `#!/usr/bin/env node
// Thesium for this film. Usage: node thesium.mjs <command> [options]   (node thesium.mjs help)
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const recorded = () => {
  try { return JSON.parse(readFileSync(join(homedir(), '.thesium', 'install.json'), 'utf8')).root; } catch { return undefined; }
};
const root = [process.env.THESIUM_HOME, ${JSON.stringify(ROOT)}, recorded()].find((r) => r && existsSync(join(r, 'src', 'cli.js')));
if (!root) {
  console.error('Thesium is not installed where this film expects it. Set THESIUM_HOME to the Thesium folder.');
  process.exit(1);
}
const { main } = await import(pathToFileURL(join(root, 'src', 'cli.js')).href);
process.exitCode = await main(['--workspace', import.meta.dirname, ...process.argv.slice(2)]);
`;

/** @param {import('./manifest.js').Manifest} m */
export function houseRules(m) {
  const guide = path.join(KNOWLEDGE_DIR, 'engines', `${m.engine}.md`).replaceAll('\\', '/');
  const library = path.join(KNOWLEDGE_DIR, 'README.md').replaceAll('\\', '/');
  return `# ${m.title}: a Thesium film

You are making a finished film for a real person. This folder is the whole film. You direct,
design, animate and score it in code, look at your own frames, and fix what you see.

## Contract (the only hard rules)
- \`thesium.json\` fixes the engine (**${m.engine}**), size ${m.width}×${m.height}, ${m.fps} fps and ${m.duration} s. Keep them.
- Every frame is a pure function of time: rendered in any order, any number of times, it looks the same.
- Offline: only files in this folder (and Thesium's fonts and kit). Nothing is fetched while rendering.
- Facts, names, dates, prices and URLs come from the brief and \`assets/SOURCES.md\` only.
- Engine contract and recipes: ${guide}

## Craft floor (every frame)
- One language on screen: the brief's. Show what you name: a named place, product or person is pictured.
- Everything reads at phone size; text never blends into its background; no two texts share a space.
- Pictures fill their frames: no empty bands, no flat empty frames, groups centred, edges clean.
- Layering stays consistent through transitions; every cut is authored on both sides.
- The final frame holds, settled and readable, for at least 2 seconds.

## Tools (run from this folder)
\`node thesium.mjs <command>\`: \`status\` · \`build\` · \`still <t…> [--phone]\` · \`strip <t>\` · \`preview\` ·
\`check\` · \`sound …\` · \`master\` · \`review\` · \`studio\` · \`notes\`. \`node thesium.mjs help\` lists everything.

## Files
- \`BRIEF.md\` the commission · \`PLAN.md\` your spec-grade plan · \`timeline.json\` the shared clock (sections, tempo, cues)
- \`film/\` the source · \`assets/\` media (+ \`SOURCES.md\` provenance) · \`audio/\` score, SFX, voice
- \`review/\` your evidence: stills, strips, sheets, previews, checks, notes, critiques · \`out/\` masters

Motion Library: ${library}
`;
}

const BRIEF = (request) => `# Brief

<request>
${request || '(Write the person\'s request here, in their words.)'}
</request>

<sources>
Links, files and facts the film may use. Everything else is unknown: do not invent it.
Record where each asset came from in assets/SOURCES.md.
</sources>
`;

const PLAN = (m) => `# Plan: ${m.title}

Write this before building (see the Motion Library's showcase.md for the shape that works).

## Concept
One sentence the viewer should remember. Benchmark (learn / do not take).

## Art direction
Stage · 3 colours + 1 accent · type pairing · texture · negative space.

## Persistent element and signature move

## Beat grid
BPM, bars, downbeats; the near-silence before the peak.

## Shots
| Time | Exact words on screen | Picture and motion | Camera | Sound | Hand-off to next |
| --- | --- | --- | --- | --- | --- |

## Motion quality
Easing and springs for this film; what it will never do.

## Accuracy guardrails
Facts the copy relies on, and what they do not allow.

## Verification
How each beat and cut will be checked before mastering.
`;

/**
 * Creates a film workspace.
 * @param {string} dir
 * @param {{ engine?: string, width: number, height: number, fps?: number, duration?: number, title?: string,
 *   brief?: string, language?: string }} o
 */
export async function createFilm(dir, o) {
  const workspace = path.resolve(dir);
  if (existsSync(path.join(workspace, 'thesium.json'))) throw new Error(`${workspace} already holds a film (thesium.json exists)`);
  const { manifest, errors } = normalize({
    title: o.title || path.basename(workspace),
    engine: o.engine || 'web',
    entry: DEFAULT_ENTRY[/** @type {keyof typeof DEFAULT_ENTRY} */ (o.engine || 'web')],
    width: o.width,
    height: o.height,
    fps: o.fps || 30,
    duration: o.duration || 15,
    language: o.language,
    motionBlur: { samples: 1, shutter: 0.5 },
    audio: {},
    params: {},
  });
  if (errors.length) throw new Error(errors.join('\n'));
  for (const sub of Object.values(LAYOUT)) await mkdir(path.join(workspace, sub), { recursive: true });
  await saveManifest(workspace, manifest);
  await writeFile(path.join(workspace, 'BRIEF.md'), BRIEF(o.brief));
  await writeFile(path.join(workspace, 'PLAN.md'), PLAN(manifest));
  await writeFile(
    path.join(workspace, 'timeline.json'),
    JSON.stringify({ bpm: 120, offset: 0, beatsPerBar: 4, sections: [{ start: 0, name: 'Opening' }], cues: [] }, null, 2) + '\n',
  );
  await writeFile(path.join(workspace, 'assets', 'SOURCES.md'), '# Sources\n\n| File | Where it came from | Rights / notes |\n| --- | --- | --- |\n');
  await writeFile(path.join(workspace, '.gitignore'), '.thesium/\n.thesium-build.jsx\nreview/\nout/\n');
  await syncWorkspace(workspace);
  return workspace;
}

/**
 * Refreshes the in-film kit, launcher and house rules. Never touches film/, assets/, audio/ or plans.
 * @param {string} workspace
 */
export async function syncWorkspace(workspace) {
  const m = await loadManifest(workspace);
  await mkdir(path.join(workspace, LAYOUT.kit), { recursive: true });
  await cp(KIT_DIR, path.join(workspace, LAYOUT.kit), { recursive: true, force: true });
  await writeFile(path.join(workspace, 'thesium.mjs'), launcher());
  await writeFile(path.join(workspace, 'AGENTS.md'), houseRules(m));
  if (!(await exists(path.join(workspace, 'CLAUDE.md')))) await writeFile(path.join(workspace, 'CLAUDE.md'), '@AGENTS.md\n');
  for (const sub of Object.values(LAYOUT)) await mkdir(path.join(workspace, sub), { recursive: true });
  await recordInstall();
  return m;
}

/**
 * Finds the film folder: an explicit one, or the nearest ancestor of cwd with thesium.json.
 * @param {string} [explicit]
 */
export function findWorkspace(explicit) {
  if (explicit) return path.resolve(explicit);
  let dir = process.cwd();
  for (;;) {
    if (existsSync(path.join(dir, 'thesium.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

/**
 * The film's shared clock: tempo, sections (named beats) and cues.
 * @param {string} workspace
 * @returns {Promise<{ bpm?: number, offset?: number, beatsPerBar?: number,
 *   sections: Array<{ start: number, name: string, end?: number }>, cues: Array<{ t: number, name?: string }> }>}
 */
export async function loadTimeline(workspace) {
  try {
    const raw = JSON.parse(await readFile(path.join(workspace, 'timeline.json'), 'utf8'));
    return {
      ...raw,
      sections: Array.isArray(raw.sections) ? raw.sections.filter((s) => typeof s?.start === 'number') : [],
      cues: Array.isArray(raw.cues) ? raw.cues : [],
    };
  } catch {
    return { sections: [], cues: [] };
  }
}
