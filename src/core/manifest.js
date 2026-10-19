// thesium.json: the one file that says what a film is. Every engine, check and
// render reads it; nothing else carries size, timing, sound or tunable parameters.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const ENGINE_IDS = /** @type {const} */ (['web', 'effectcraft', 'remotion', 'hyperframes', 'command']);

/** Default entry for each engine, relative to the workspace. */
export const DEFAULT_ENTRY = {
  web: 'film/index.html',
  effectcraft: 'film/build.jsx',
  remotion: 'film/remotion',
  hyperframes: 'film/hyperframes',
  command: 'film',
};

/** Named frame sizes. */
export const SIZES = {
  '16:9': [1920, 1080],
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
  '21:9': [2560, 1080],
  '4k': [3840, 2160],
  '720p': [1280, 720],
};

/**
 * @typedef {{ type: 'number' | 'color' | 'text' | 'boolean' | 'choice', value: any, label?: string,
 *   min?: number, max?: number, step?: number, options?: string[], group?: string, hint?: string }} Param
 * @typedef {object} Manifest
 * @property {string} title
 * @property {typeof ENGINE_IDS[number]} engine
 * @property {string} entry
 * @property {number} width
 * @property {number} height
 * @property {number} fps
 * @property {number} duration seconds
 * @property {{ samples: number, shutter: number }} motionBlur temporal supersampling applied by Thesium
 * @property {{ music?: string, sfx?: string, voice?: string, gains: { music: number, sfx: number, voice: number },
 *   duck: number | 'auto', loudness: number, truePeak: number }} audio duck: how far music dips under narration
 * @property {Record<string, Param>} params tunable values the studio UI exposes
 * @property {string} [language] BCP 47 language of on-screen text
 * @property {Record<string, any>} engineOptions per-engine settings
 */

/** Parses "1920x1080" or a named size. @param {string} value */
export function parseSize(value) {
  const named = SIZES[/** @type {keyof typeof SIZES} */ (String(value).toLowerCase())];
  if (named) return { width: named[0], height: named[1] };
  const m = /^(\d{2,5})\s*[x×]\s*(\d{2,5})$/i.exec(String(value).trim());
  if (!m) throw new Error(`Size must be WIDTHxHEIGHT or one of ${Object.keys(SIZES).join(', ')}; got "${value}"`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Validates raw JSON and fills defaults. Collects every problem instead of stopping at the first.
 * @param {any} raw
 * @returns {{ manifest: Manifest, errors: string[] }}
 */
export function normalize(raw) {
  /** @type {string[]} */
  const errors = [];
  if (!isObject(raw)) return { manifest: /** @type {any} */ (raw), errors: ['thesium.json must be a JSON object'] };
  const engine = raw.engine ?? 'web';
  if (!ENGINE_IDS.includes(engine)) errors.push(`engine must be one of ${ENGINE_IDS.join(', ')}; got "${engine}"`);
  const num = (key, min, max, fallback) => {
    const v = raw[key] ?? fallback;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
      errors.push(`${key} must be a number from ${min} to ${max}; got ${JSON.stringify(v)}`);
      return fallback;
    }
    return v;
  };
  const width = num('width', 16, 8192, 1920);
  const height = num('height', 16, 8192, 1080);
  if (width % 2 || height % 2) errors.push(`width and height must be even for H.264; got ${width}×${height}`);
  const fps = num('fps', 1, 120, 30);
  const duration = num('duration', 0.1, 3600, 10);
  const blur = isObject(raw.motionBlur) ? raw.motionBlur : {};
  const samples = blur.samples ?? 1;
  const shutter = blur.shutter ?? 0.5;
  if (!Number.isInteger(samples) || samples < 1 || samples > 32)
    errors.push(`motionBlur.samples must be an integer from 1 to 32; got ${JSON.stringify(samples)}`);
  if (typeof shutter !== 'number' || shutter < 0 || shutter > 1)
    errors.push(`motionBlur.shutter must be from 0 to 1 (0.5 = 180°); got ${JSON.stringify(shutter)}`);
  const audio = isObject(raw.audio) ? raw.audio : {};
  for (const key of ['music', 'sfx', 'voice'])
    if (audio[key] !== undefined && audio[key] !== null && typeof audio[key] !== 'string')
      errors.push(`audio.${key} must be a workspace path or null`);
  const gains = { music: 0, sfx: -4, voice: 0, ...(isObject(audio.gains) ? audio.gains : {}) };
  for (const [key, value] of Object.entries(gains))
    if (typeof value !== 'number' || value < -60 || value > 24) errors.push(`audio.gains.${key} must be dB from -60 to 24`);
  const duck = audio.duck ?? 'auto';
  if (duck !== 'auto' && (typeof duck !== 'number' || duck < 0 || duck > 30))
    errors.push('audio.duck must be "auto" or dB from 0 to 30 (how far music dips under narration; 0 = off)');
  const params = isObject(raw.params) ? raw.params : {};
  for (const [id, p] of Object.entries(params)) {
    if (!/^[A-Za-z_][\w-]*$/.test(id)) errors.push(`params.${id}: ids are letters, digits, _ and -`);
    if (!isObject(p) || !['number', 'color', 'text', 'boolean', 'choice'].includes(p.type))
      errors.push(`params.${id}.type must be number, color, text, boolean or choice`);
    else if (p.type === 'choice' && !(Array.isArray(p.options) && p.options.length))
      errors.push(`params.${id}: a choice needs options`);
    else if (p.type === 'color' && !/^#[0-9a-f]{6}$/i.test(String(p.value)))
      errors.push(`params.${id}: colors are #rrggbb`);
  }
  const resolvedEngine = /** @type {Manifest['engine']} */ (ENGINE_IDS.includes(engine) ? engine : 'web');
  /** @type {Manifest} */
  const manifest = {
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Untitled film',
    engine: resolvedEngine,
    entry: typeof raw.entry === 'string' && raw.entry ? raw.entry : DEFAULT_ENTRY[resolvedEngine],
    width,
    height,
    fps,
    duration,
    motionBlur: { samples, shutter },
    audio: {
      music: audio.music || undefined,
      sfx: audio.sfx || undefined,
      voice: audio.voice || undefined,
      gains,
      duck: typeof duck === 'number' ? duck : 'auto',
      loudness: typeof audio.loudness === 'number' ? audio.loudness : -14,
      truePeak: typeof audio.truePeak === 'number' ? audio.truePeak : -1,
    },
    params,
    language: typeof raw.language === 'string' ? raw.language : undefined,
    engineOptions: isObject(raw.engineOptions) ? raw.engineOptions : {},
  };
  return { manifest, errors };
}

/** @param {string} workspace */
export const manifestPath = (workspace) => path.join(workspace, 'thesium.json');

/**
 * Reads and validates thesium.json. Throws one message listing every problem.
 * @param {string} workspace
 */
export async function loadManifest(workspace) {
  let raw;
  try {
    raw = JSON.parse(await readFile(manifestPath(workspace), 'utf8'));
  } catch (error) {
    const code = /** @type {NodeJS.ErrnoException} */ (error).code;
    throw new Error(
      code === 'ENOENT'
        ? `No thesium.json in ${workspace}. Create a film with: thesium new <folder>`
        : `thesium.json is not valid JSON: ${/** @type {Error} */ (error).message}`,
    );
  }
  const { manifest, errors } = normalize(raw);
  if (errors.length) throw new Error(`thesium.json has problems:\n- ${errors.join('\n- ')}`);
  return manifest;
}

/** Writes a manifest back, keeping key order readable. @param {string} workspace @param {Manifest} m */
export async function saveManifest(workspace, m) {
  const audio = Object.fromEntries(Object.entries(m.audio).filter(([, v]) => v !== undefined));
  const out = {
    title: m.title,
    engine: m.engine,
    entry: m.entry,
    width: m.width,
    height: m.height,
    fps: m.fps,
    duration: m.duration,
    motionBlur: m.motionBlur,
    audio,
    ...(m.language ? { language: m.language } : {}),
    params: m.params,
    engineOptions: m.engineOptions,
  };
  await writeFile(manifestPath(workspace), JSON.stringify(out, null, 2) + '\n');
}

/**
 * Parameter values for a render: declared defaults, then overrides by id.
 * @param {Manifest} m
 * @param {Record<string, any>} [overrides]
 */
export function resolveParams(m, overrides = {}) {
  /** @type {Record<string, any>} */
  const values = {};
  for (const [id, p] of Object.entries(m.params)) values[id] = p.value;
  for (const [id, v] of Object.entries(overrides)) {
    const p = m.params[id];
    if (!p) continue;
    values[id] = p.type === 'number' ? Number(v) : p.type === 'boolean' ? v === true || v === 'true' : v;
  }
  return values;
}

/** Total frames in the film. @param {Manifest} m */
export const frameCount = (m) => Math.round(m.duration * m.fps);

/**
 * Sample times for output frame `frame`, centred on the frame and spread across the shutter.
 * One sample is the frame time itself.
 * @param {number} frame
 * @param {number} fps
 * @param {number} samples
 * @param {number} shutter fraction of the frame interval the shutter is open (0.5 = 180°)
 */
export function sampleTimes(frame, fps, samples, shutter) {
  if (samples <= 1 || shutter <= 0) return [frame / fps];
  return Array.from({ length: samples }, (_, i) => (frame + ((i + 0.5) / samples - 0.5) * shutter) / fps);
}

/** The information a film's code receives about itself. @param {Manifest} m @param {Record<string, any>} params */
export function filmInfo(m, params) {
  return {
    title: m.title,
    width: m.width,
    height: m.height,
    fps: m.fps,
    duration: m.duration,
    frames: frameCount(m),
    params,
  };
}
