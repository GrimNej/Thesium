// command: bring any renderer. Describe how to draw one frame (and optionally a range) as
// command templates in thesium.json, and Thesium gives that tool the same studio as the rest:
//
// "engineOptions": { "command": {
//    "build": "blender -b film/scene.blend --python film/build.py",          (optional)
//    "frame": "blender -b film/scene.blend -o {outBase} -F PNG -f {frame}",  (required)
//    "frameFile": "{outBase}{frame4}.png",                                   (optional: where the tool writes)
//    "sequence": "…",                                                        (optional: {from} {to} {fps} {dir})
//    "parallel": 2 } }
//
// Placeholders: {t} seconds, {frame} index, {frame4}/{frame6} zero-padded, {out} target PNG,
// {outBase} target without extension, {from} {to} {fromFrame} {toFrame} {fps} {dir} {width} {height} {params} (JSON file),
// {workspace}. Commands run through the shell in the workspace.
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { run } from '../core/proc.js';
import { filmInfo } from '../core/manifest.js';

/** @param {string} template @param {Record<string, string | number>} values */
function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (all, key) => (key in values ? String(values[key]) : all));
}

/** @param {string} line @param {string} cwd @param {AbortSignal} [signal] */
async function sh(line, cwd, signal) {
  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', `"${line}"`] : ['-c', line];
  return run(shell, args, { cwd, timeout: 3600000, signal });
}

/** @type {import('./index.js').Engine} */
export const commandEngine = {
  id: 'command',
  label: 'Command (any renderer with a CLI)',
  summary: 'Blender, Manim, Motion Canvas or your own tool, through command templates',
  guide: 'engines/command.md',

  async detect() {
    return { ok: true, detail: 'Uses the commands in thesium.json → engineOptions.command' };
  },

  async scaffold(workspace, m) {
    await mkdir(path.join(workspace, 'film'), { recursive: true });
    if (!m.engineOptions.command) {
      const { saveManifest } = await import('../core/manifest.js');
      m.engineOptions.command = { frame: 'REPLACE: a command that writes the frame at {t} seconds to {out}', parallel: 1 };
      await saveManifest(workspace, m);
      return ['thesium.json (engineOptions.command)'];
    }
    return [];
  },

  async lint(workspace, m) {
    const c = m.engineOptions.command || {};
    if (typeof c.frame !== 'string' || c.frame.startsWith('REPLACE'))
      return [{ level: 'error', message: 'thesium.json → engineOptions.command.frame must be a command that renders {t} to {out}' }];
    return [];
  },

  async build(workspace, m) {
    const c = m.engineOptions.command || {};
    if (!c.build) return 'no build step';
    await sh(c.build, workspace);
    return `ran ${c.build}`;
  },

  async open(workspace, m, o) {
    const c = m.engineOptions.command || {};
    const params = path.join(workspace, '.thesium', 'params.json');
    await mkdir(path.dirname(params), { recursive: true });
    await writeFile(params, JSON.stringify(filmInfo(m, o.params), null, 1));
    if (c.build) await sh(c.build, workspace, o.signal);
    const base = { width: m.width, height: m.height, fps: m.fps, params, workspace };
    let n = 0;
    return {
      format: 'png',
      parallel: Math.max(1, Number(c.parallel) || 1),
      async frame(t, slot = 0) {
        const frame = Math.round(t * m.fps);
        const out = path.join(workspace, '.thesium', `cmd-${slot}-${n++}.png`);
        const outBase = out.slice(0, -4);
        const values = { ...base, t: t.toFixed(5), frame, frame4: String(frame).padStart(4, '0'), frame6: String(frame).padStart(6, '0'), out, outBase };
        await sh(fill(c.frame, values), workspace, o.signal);
        const written = c.frameFile ? fill(c.frameFile, values) : out;
        if (!existsSync(written)) throw new Error(`The frame command wrote nothing at ${written}`);
        const data = await readFile(written);
        await rm(written, { force: true });
        return data;
      },
      ...(c.sequence
        ? {
            async sequence({ from, to, fps, dir }) {
              await rm(dir, { recursive: true, force: true });
              await mkdir(dir, { recursive: true });
              const fromFrame = Math.round(from * fps);
              const toFrame = Math.round(to * fps) - 1;
              await sh(fill(c.sequence, { ...base, from, to, fps, dir, fromFrame, toFrame }), workspace, o.signal);
              const files = (await readdir(dir)).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();
              const ext = path.extname(files[0] || '.png').toLowerCase();
              for (let i = 0; i < files.length; i++) await rename(path.join(dir, files[i]), path.join(dir, `f_${String(i).padStart(6, '0')}${ext}`));
              return { pattern: path.join(dir, `f_%06d${ext}`), format: ext === '.png' ? 'png' : 'jpeg' };
            },
          }
        : {}),
      async close() {},
    };
  },
};
