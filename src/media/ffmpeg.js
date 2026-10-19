// Every pixel and sample operation Thesium needs, done by FFmpeg: no image libraries.
import { mkdir, mkdtemp, rm, copyFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { run, pipeTo } from '../core/proc.js';
import { FONT_DIR } from '../core/paths.js';

export const ffmpeg = () => process.env.THESIUM_FFMPEG || 'ffmpeg';
export const ffprobe = () => process.env.THESIUM_FFPROBE || 'ffprobe';

/** Runs FFmpeg quietly. @param {string[]} args @param {import('../core/proc.js').RunOptions} [options] */
export const ff = (args, options = {}) => run(ffmpeg(), ['-hide_banner', '-v', 'error', '-y', ...args], options);

/**
 * Streams and format of a media file.
 * @param {string} file
 * @returns {Promise<{ format: any, streams: any[], video?: any, audio?: any, duration: number }>}
 */
export async function probe(file) {
  const { stdout } = await run(ffprobe(), ['-v', 'quiet', '-show_format', '-show_streams', '-of', 'json', file]);
  const data = JSON.parse(stdout);
  const video = data.streams.find((s) => s.codec_type === 'video');
  const audio = data.streams.find((s) => s.codec_type === 'audio');
  return { ...data, video, audio, duration: Number(data.format?.duration || video?.duration || 0) };
}

/** A path written so FFmpeg's filter parser reads it literally (drive colons and quotes escaped). */
export function filterPath(file) {
  return file.replaceAll('\\', '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

const labelFont = () => filterPath(path.join(FONT_DIR, 'JetBrainsMono.ttf'));

/** Text drawn under a tile; only characters that are safe inside drawtext. @param {string} text */
const safeLabel = (text) => text.replace(/[^\w .:+\-/s]/g, '').replace(/:/g, '\\:');

/**
 * Opens an H.264 encoder that reads a stream of images (JPEG or PNG) from a pipe.
 * `samples` > 1 averages that many consecutive images into one output frame (motion blur).
 * @param {object} o
 * @param {string} o.output
 * @param {number} o.fps output frame rate
 * @param {'jpeg' | 'png'} o.format image format written to the pipe
 * @param {number} [o.samples]
 * @param {number} [o.width] output width (scales when it differs from the images)
 * @param {number} [o.height]
 * @param {number} [o.crf]
 * @param {string} [o.preset]
 */
export function openEncoder(o) {
  const samples = Math.max(1, o.samples || 1);
  const filters = [];
  if (samples > 1)
    filters.push(`tmix=frames=${samples}`, `select='not(mod(n+1\\,${samples}))'`, `setpts=N/(${o.fps}*TB)`);
  filters.push(o.width && o.height ? `scale=${o.width}:${o.height}:flags=lanczos` : 'scale=trunc(iw/2)*2:trunc(ih/2)*2');
  // Full-range RGB in, limited-range BT.709 out: what every player expects from H.264.
  filters.push('scale=in_range=pc:out_range=tv:out_color_matrix=bt709', 'format=yuv420p');
  return pipeTo(ffmpeg(), [
    '-hide_banner',
    '-v',
    'error',
    '-y',
    '-f',
    'image2pipe',
    '-c:v',
    o.format === 'png' ? 'png' : 'mjpeg',
    '-framerate',
    String(o.fps * samples),
    '-i',
    '-',
    '-vf',
    filters.join(','),
    '-r',
    String(o.fps),
    '-c:v',
    'libx264',
    '-preset',
    o.preset || 'medium',
    '-crf',
    String(o.crf ?? 16),
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
  ]);
}

/** Joins H.264 segments made with identical settings, without re-encoding. @param {string[]} parts @param {string} output */
export async function concatVideos(parts, output) {
  if (parts.length === 1) {
    await copyFile(parts[0], output);
    return;
  }
  const list = `${output}.parts.txt`;
  await writeFile(list, parts.map((p) => `file '${p.replaceAll('\\', '/').replace(/'/g, "'\\''")}'`).join('\n'));
  await ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', output]);
  await rm(list, { force: true });
}

/** Averages images into one (a motion-blurred still). @param {string[]} inputs @param {string} output */
export async function averageImages(inputs, output) {
  if (inputs.length === 1) return convertImage(inputs[0], output);
  const args = inputs.flatMap((f) => ['-i', f]);
  await ff([...args, '-filter_complex', `mix=inputs=${inputs.length}`, '-frames:v', '1', ...quality(output), output]);
}

/** @param {string} file */
const quality = (file) => (/\.jpe?g$/i.test(file) ? ['-q:v', '2'] : []);

/** Converts or rescales an image. @param {string} input @param {string} output @param {number} [width] */
export async function convertImage(input, output, width) {
  if (path.resolve(input) === path.resolve(output) && !width) return;
  await ff(['-i', input, ...(width ? ['-vf', `scale=${width}:-2:flags=lanczos`] : []), '-frames:v', '1', ...quality(output), output]);
}

/**
 * Tiles images into one labelled sheet.
 * @param {string[]} files
 * @param {string[]} labels one per file
 * @param {string} output
 * @param {{ columns?: number, width?: number }} [o] tile width in pixels
 */
export async function tile(files, labels, output, o = {}) {
  if (!files.length) throw new Error('Nothing to tile');
  const columns = Math.min(o.columns || 6, files.length);
  const rows = Math.ceil(files.length / columns);
  const width = o.width || 320;
  const dir = await mkdtemp(path.join(os.tmpdir(), 'thesium-tile-'));
  try {
    for (let i = 0; i < files.length; i++)
      await copyFile(files[i], path.join(dir, `${String(i).padStart(4, '0')}${path.extname(files[i]) || '.jpg'}`));
    const ext = path.extname(files[0]) || '.jpg';
    const font = labelFont();
    const size = Math.max(12, Math.round(width / 22));
    const pad = size + 10;
    const draws = labels.map(
      (label, i) =>
        `drawtext=fontfile='${font}':text='${safeLabel(label)}':x=8:y=h-${pad - 4}:fontsize=${size}:fontcolor=0xD9FF78:enable='eq(n\\,${i})'`,
    );
    const vf = [
      `scale=${width}:-2:flags=lanczos`,
      `pad=iw:ih+${pad}:0:0:0x0D0F0E`,
      ...draws,
      `tile=${columns}x${rows}:color=0x0D0F0E`,
    ].join(',');
    await mkdir(path.dirname(output), { recursive: true });
    await ff(['-framerate', '1', '-i', path.join(dir, `%04d${ext}`), '-vf', vf, '-frames:v', '1', ...quality(output), output]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return output;
}

/**
 * Grabs frames of a video at the given times.
 * @param {string} video
 * @param {number[]} times
 * @param {(t: number, i: number) => string} name output file for each time
 */
export async function grabFrames(video, times, name) {
  const out = [];
  for (let i = 0; i < times.length; i++) {
    const file = name(times[i], i);
    await ff(['-ss', String(Math.max(0, times[i])), '-i', video, '-frames:v', '1', ...quality(file), file]);
    out.push(file);
  }
  return out;
}

/**
 * Contact sheet of a video: one frame every `step` seconds, labelled with its time.
 * @param {string} video
 * @param {string} output
 * @param {{ step?: number, width?: number, columns?: number, from?: number, to?: number }} [o]
 */
export async function videoSheet(video, output, o = {}) {
  const info = await probe(video);
  const from = o.from || 0;
  const to = Math.min(o.to ?? info.duration, info.duration);
  const step = o.step || 1;
  const times = [];
  for (let t = from; t < to - 0.02; t += step) times.push(Number(t.toFixed(3)));
  if (!times.length) times.push(from);
  const dir = await mkdtemp(path.join(os.tmpdir(), 'thesium-sheet-'));
  try {
    const files = await grabFrames(video, times.map((t) => t - from), (_, i) => path.join(dir, `${String(i).padStart(4, '0')}.jpg`));
    await tile(files, times.map((t) => `${t.toFixed(1)}s`), output, { width: o.width || 320, columns: o.columns || 6 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return { output, frames: times.length, times };
}

/**
 * Decodes a video (or image) to raw RGB frames at a small size, for measurements.
 * @param {string} input
 * @param {{ width: number, height?: number, fps?: number }} o
 * @returns {AsyncGenerator<{ index: number, rgb: Buffer, width: number, height: number }>}
 */
export async function* rawFrames(input, o) {
  let height = o.height;
  if (!height) {
    const info = await probe(input);
    const v = info.video;
    height = Math.max(2, Math.round((o.width * v.height) / v.width / 2) * 2);
  }
  const width = o.width;
  const vf = [...(o.fps ? [`fps=${o.fps}`] : []), `scale=${width}:${height}:flags=area`].join(',');
  const child = spawn(ffmpeg(), ['-v', 'error', '-i', input, '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const size = width * height * 3;
  let pending = Buffer.alloc(0);
  let index = 0;
  try {
    for await (const chunk of child.stdout) {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      while (pending.length >= size) {
        yield { index: index++, rgb: pending.subarray(0, size), width, height };
        pending = pending.subarray(size);
      }
    }
  } finally {
    // A caller that stops early must not leave FFmpeg holding the file open (Windows locks it).
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once('close', resolve));
    }
  }
}

/** Mean absolute difference (0–255) between two images at a small size. @param {string} a @param {string} b */
export async function imageDifference(a, b) {
  const read = async (file) => {
    for await (const frame of rawFrames(file, { width: 192, height: 108 })) return frame.rgb;
    throw new Error(`Could not decode ${file}`);
  };
  const [x, y] = await Promise.all([read(a), read(b)]);
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += Math.abs(x[i] - y[i]);
  return sum / x.length;
}

/** FFmpeg version string, or undefined when it is missing. */
export async function ffmpegVersion() {
  try {
    const { stdout } = await run(ffmpeg(), ['-version']);
    return stdout.split('\n')[0].replace(/^ffmpeg version\s*/, '').split(' ')[0];
  } catch {
    return undefined;
  }
}
