// Temporary space for native frame sequences: a 30 s master with 8 motion-blur samples is 7,200
// frames, tens of gigabytes as PNG. Better to say so before rendering than to fail halfway.
import { mkdir, statfs } from 'node:fs/promises';

const gb = (bytes) => `${(bytes / 1e9).toFixed(1)} GB`;

/**
 * Throws when `dir`'s drive has less than `bytes` free (with a 10 % margin).
 * @param {string} dir
 * @param {number} bytes
 * @param {string} what what needs the space, for the message
 */
export async function ensureSpace(dir, bytes, what) {
  await mkdir(dir, { recursive: true });
  const s = await statfs(dir).catch(() => undefined);
  if (!s) return;
  const free = Number(s.bavail) * Number(s.bsize);
  if (bytes > free * 0.9)
    throw new Error(
      `${what} needs about ${gb(bytes)} of temporary space and ${gb(free)} is free on that drive (${dir}). ` +
        'Free some space, or point TEMP (Windows) or TMPDIR to a larger drive.',
    );
}

/** Rough bytes per frame for an image format at a size. @param {'png' | 'jpeg'} format */
export const frameBytes = (format, width, height) => width * height * (format === 'png' ? 3 : 0.35);
