// The engine contract. Thesium asks one thing of a renderer: draw the frame at time t.
// Stills, strips, motion blur, sheets, previews, determinism checks, masters and QA are
// built on that, so every engine gets the same eyes, ears and quality gate.

/**
 * @typedef {{ level: 'error' | 'warning', message: string, file?: string }} Finding
 *
 * @typedef {object} OpenOptions
 * @property {Record<string, any>} params resolved parameter values
 * @property {number} [scale] render scale for previews (1 = full size)
 * @property {(line: string) => void} [log]
 * @property {AbortSignal} [signal]
 *
 * @typedef {object} Session
 * @property {'jpeg' | 'png'} format image format `frame` returns
 * @property {number} parallel how many frames may render at once (slots 0..parallel-1)
 * @property {(t: number, slot?: number) => Promise<Buffer>} frame the image at time t (seconds)
 * @property {(times: number[], files: string[]) => Promise<string[]>} [frames]
 *   optional batch of exact times in one call; returns the files written (format may differ from the names asked for)
 * @property {(o: { from: number, to: number, fps: number, dir: string,
 *   onProgress?: (done: number, total: number) => void }) => Promise<{ pattern: string, format: 'png' | 'jpeg' }>} [sequence]
 *   optional native render of frames from + i/fps for [from, to) into a numbered image sequence (FFmpeg pattern)
 * @property {() => Promise<void>} close
 *
 * @typedef {object} Engine
 * @property {string} id
 * @property {string} label
 * @property {string} summary one line: what the engine is good at
 * @property {string} guide knowledge file with the authoring contract and recipes
 * @property {() => Promise<{ ok: boolean, version?: string, detail: string, fix?: string }>} detect
 * @property {(workspace: string, manifest: import('../core/manifest.js').Manifest) => Promise<string[]>} scaffold
 *   writes a minimal starting source (a contract skeleton, never a look) and returns the files
 * @property {(workspace: string, manifest: import('../core/manifest.js').Manifest, options: OpenOptions) => Promise<Session>} open
 * @property {(workspace: string, manifest: import('../core/manifest.js').Manifest) => Promise<Finding[]>} lint
 *   engine-specific static checks of the source
 * @property {(workspace: string, manifest: import('../core/manifest.js').Manifest, options: OpenOptions) => Promise<string>} [build]
 *   compiles the source when the engine needs it (returns a short report)
 */

import { webEngine } from './web.js';
import { effectcraftEngine } from './effectcraft.js';
import { remotionEngine } from './remotion.js';
import { hyperframesEngine } from './hyperframes.js';
import { commandEngine } from './command.js';

/** @type {Record<string, Engine>} */
export const ENGINES = {
  web: webEngine,
  effectcraft: effectcraftEngine,
  remotion: remotionEngine,
  hyperframes: hyperframesEngine,
  command: commandEngine,
};

/** @param {string} id */
export function engine(id) {
  const e = ENGINES[id];
  if (!e) throw new Error(`Unknown engine "${id}". Engines: ${Object.keys(ENGINES).join(', ')}`);
  return e;
}

/** Strips JS/CSS comments so rules only see code. @param {string} text */
export function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
}

/**
 * Applies regex rules to source text.
 * @param {string} text
 * @param {string} file
 * @param {Array<{ pattern: RegExp, level: Finding['level'], message: string }>} rules
 * @returns {Finding[]}
 */
export function scan(text, file, rules) {
  const code = stripComments(text);
  return rules.filter((r) => r.pattern.test(code)).map((r) => ({ level: r.level, message: r.message, file }));
}
