// Engine-independent rendering: exact stills (with the master's motion blur), strips across
// cuts, and full videos. Everything here only needs Session.frame(t); faster paths are used
// when an engine offers them.
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { frameCount, sampleTimes } from '../core/manifest.js';
import { pool } from '../core/proc.js';
import { averageImages, concatVideos, convertImage, ff, openEncoder, tile } from '../media/ffmpeg.js';

/**
 * How a native sequence renders motion blur, matching sampleTimes(): the engine draws `perFrame`
 * sub-frames per frame on an even grid (fps × perFrame, capped by the engine's own limit), and each
 * output frame averages the `window` sub-frames that fall inside its shutter, centred on its time.
 * `last` is the window's last sub-frame relative to the frame's own, for FFmpeg's tmix, which
 * averages backwards from the frame it outputs.
 * @param {number} fps @param {number} samples @param {number} shutter fraction of a frame (0.5 = 180°)
 * @param {number} [maxFps] the engine's highest sequence rate
 */
export function nativeSampling(fps, samples, shutter, maxFps = Infinity) {
  if (samples <= 1 || shutter <= 0) return { perFrame: 1, window: 1, last: 0 };
  const open = Math.min(1, shutter);
  const ideal = Math.max(samples, Math.round(samples / open));
  const perFrame = Math.max(1, Math.min(ideal, Math.floor(maxFps / fps)));
  const window = Math.max(1, Math.min(perFrame, Math.round(perFrame * open)));
  return { perFrame, window, last: Math.ceil(window / 2) - 1 };
}

/**
 * Renders exact times to image files (JPEG unless the name says .png).
 * With samples > 1 every still averages the samples across the shutter, like the master.
 * @param {import('../engines/index.js').Session} session
 * @param {import('../core/manifest.js').Manifest} m
 * @param {number[]} times
 * @param {string[]} files
 * @param {{ samples?: number, shutter?: number }} [o]
 */
export async function renderStills(session, m, times, files, o = {}) {
  const samples = o.samples ?? m.motionBlur.samples;
  const shutter = o.shutter ?? m.motionBlur.shutter;
  const clamp = (t) => Math.max(0, Math.min(m.duration - 1e-3, t));
  const groups = times.map((t) =>
    samples > 1 ? sampleTimes(Math.round(t * m.fps), m.fps, samples, shutter).map(clamp) : [clamp(t)],
  );
  const flat = groups.flat();
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'thesium-stills-'));
  try {
    const ext = session.format === 'png' ? '.png' : '.jpg';
    const names = flat.map((_, i) => path.join(tmp, `${String(i).padStart(5, '0')}${ext}`));
    let written = names;
    if (session.frames) written = await session.frames(flat, names);
    else
      await pool(flat, session.parallel, async (t, i) => {
        await writeFile(names[i], await session.frame(t, i % session.parallel));
      });
    let k = 0;
    for (let i = 0; i < files.length; i++) {
      const parts = written.slice(k, k + groups[i].length);
      k += groups[i].length;
      await mkdir(path.dirname(files[i]), { recursive: true });
      if (parts.length > 1) await averageImages(parts, files[i]);
      else await convertImage(parts[0], files[i]);
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  return files;
}

/** Phone-size copies (360 px wide) for reading checks. @param {string[]} files */
export async function phoneCopies(files) {
  const out = [];
  for (const file of files) {
    const target = file.replace(/(\.\w+)$/, '-phone$1');
    await convertImage(file, target, 360);
    out.push(target);
  }
  return out;
}

/**
 * Neighbouring frames in one labelled image, for fast moves and cuts.
 * @param {import('../engines/index.js').Session} session
 * @param {import('../core/manifest.js').Manifest} m
 * @param {number} t start time
 * @param {string} output
 * @param {{ count?: number, step?: number, samples?: number }} [o] step in frames
 */
export async function renderStrip(session, m, t, output, o = {}) {
  const count = o.count || 12;
  const step = o.step || 1;
  const times = Array.from({ length: count }, (_, i) => Number((t + (i * step) / m.fps).toFixed(4)));
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'thesium-strip-'));
  try {
    const files = times.map((_, i) => path.join(tmp, `${String(i).padStart(3, '0')}.jpg`));
    await renderStills(session, m, times, files, { samples: o.samples });
    await tile(files, times.map((x) => `${x.toFixed(3)}s`), output, { columns: Math.min(count, 6), width: 320 });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  return { output, times };
}

/**
 * Renders [from, to) to a silent H.264 file. Uses the engine's native sequence render when it has
 * one; otherwise captures frames in parallel slots, encodes a segment per slot, and joins them.
 * @param {import('../engines/index.js').Session} session
 * @param {import('../core/manifest.js').Manifest} m
 * @param {object} o
 * @param {string} o.output
 * @param {number} [o.from]
 * @param {number} [o.to]
 * @param {number} [o.samples] motion-blur samples per frame
 * @param {number} [o.shutter]
 * @param {boolean} [o.draft] fast encode for previews
 * @param {string} [o.scratch] folder for temporary frames
 * @param {(done: number, total: number) => void} [o.onProgress]
 * @param {AbortSignal} [o.signal]
 */
export async function renderVideo(session, m, o) {
  const fps = m.fps;
  const samples = Math.max(1, o.samples ?? m.motionBlur.samples);
  const shutter = o.shutter ?? m.motionBlur.shutter;
  const first = Math.max(0, Math.round((o.from ?? 0) * fps));
  const last = Math.min(frameCount(m), Math.round((o.to ?? m.duration) * fps));
  if (last <= first) throw new Error(`Nothing to render between ${o.from ?? 0} s and ${o.to ?? m.duration} s`);
  const crf = o.draft ? 24 : 16;
  const preset = o.draft ? 'veryfast' : 'medium';
  await mkdir(path.dirname(o.output), { recursive: true });
  const scratch = o.scratch || (await mkdtemp(path.join(os.tmpdir(), 'thesium-video-')));
  await mkdir(scratch, { recursive: true });
  try {
    const dir = path.join(scratch, 'seq');
    /** @type {{ pattern: string, format: string } | { video: string } | undefined} */
    let seq;
    const plan = nativeSampling(fps, samples, shutter, session.maxSequenceFps);
    if (session.sequence) {
      try {
        // Native render on a sub-frame grid when there is motion blur (see nativeSampling).
        seq = await session.sequence({
          from: first / fps,
          to: last / fps,
          fps: fps * plan.perFrame,
          dir,
          onProgress: (done, total) => o.onProgress?.(done, total),
        });
      } catch (error) {
        if (!(/** @type {any} */ (error).partial)) throw error;
      }
    }
    if (seq) {
      const filters = [];
      if (plan.window > 1) filters.push(`tmix=frames=${plan.window}`);
      if (plan.perFrame > 1) filters.push(`select='eq(mod(n-${plan.last}\\,${plan.perFrame})\\,0)*gte(n\\,${plan.last})'`, `setpts=N/(${fps}*TB)`);
      filters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709', 'format=yuv420p');
      let input;
      if ('video' in seq) input = ['-i', seq.video];
      else {
        if (!(await readdir(dir)).length) throw new Error('The engine rendered no frames');
        input = ['-framerate', String(fps * plan.perFrame), '-start_number', String(await firstNumber(dir)), '-i', seq.pattern];
      }
      await ff([
        ...input,
        '-vf',
        filters.join(','),
        '-r',
        String(fps),
        '-c:v',
        'libx264',
        '-preset',
        preset,
        '-crf',
        String(crf),
        '-pix_fmt',
        'yuv420p',
        '-colorspace',
        'bt709',
        '-color_primaries',
        'bt709',
        '-color_trc',
        'bt709',
        '-color_range',
        'tv',
        '-movflags',
        '+faststart',
        o.output,
      ], { timeout: 3 * 3600000, signal: o.signal });
      return { output: o.output, frames: last - first };
    }
    const times = [];
    for (let f = first; f < last; f++) times.push(sampleTimes(f, fps, samples, shutter).map((t) => Math.max(0, Math.min(m.duration - 1e-3, t))));
    const slots = Math.max(1, Math.min(session.parallel, Math.ceil(times.length / 12)));
    const chunk = Math.ceil(times.length / slots);
    const total = times.length;
    let done = 0;
    const segments = [];
    await Promise.all(
      Array.from({ length: slots }, async (_, s) => {
        const start = s * chunk;
        const end = Math.min(total, start + chunk);
        if (start >= end) return;
        const segment = path.join(scratch, `segment-${s}.mp4`);
        segments[s] = segment;
        const encoder = openEncoder({ output: segment, fps, format: session.format, samples, crf, preset });
        try {
          for (let i = start; i < end; i++) {
            o.signal?.throwIfAborted();
            for (const t of times[i]) await encoder.write(await session.frame(t, s));
            done++;
            if (done % 10 === 0 || done === total) o.onProgress?.(done, total);
          }
          await encoder.end();
        } catch (error) {
          encoder.kill();
          throw error;
        }
      }),
    );
    await concatVideos(segments.filter(Boolean), o.output);
    return { output: o.output, frames: total };
  } finally {
    if (!o.scratch) await rm(scratch, { recursive: true, force: true });
    else await rm(path.join(scratch, 'seq'), { recursive: true, force: true });
  }
}

/** Lowest frame number in a numbered sequence folder. @param {string} dir */
async function firstNumber(dir) {
  const numbers = (await readdir(dir)).map((f) => Number(/(\d+)\.\w+$/.exec(f)?.[1])).filter(Number.isFinite);
  return numbers.length ? Math.min(...numbers) : 0;
}
