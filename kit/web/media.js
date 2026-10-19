// Frame-accurate media for render(t). Import: import { image, frames } from '/kit/web/media.js';

const cache = new Map();

/** Loads and decodes an image once. */
export function image(src) {
  if (!cache.has(src))
    cache.set(
      src,
      (async () => {
        const img = new Image();
        img.decoding = 'sync';
        img.src = src;
        await img.decode();
        return img;
      })(),
    );
  return cache.get(src);
}

/** Preload many images before window.ready. */
export const images = (srcs) => Promise.all(srcs.map(image));

/**
 * A frame sequence extracted with `node thesium.mjs frames assets/clip.mp4`.
 * const clip = await frames('/assets/frames/clip');
 * const img = await clip.at(t - clipStart);   // decoded frame for that moment
 * Options: loop (default false), speed (default 1), hold last frame after the end.
 */
export async function frames(dir, { loop = false, speed = 1 } = {}) {
  const meta = await (await fetch(`${dir}/frames.json`)).json();
  const count = meta.count;
  const fps = meta.fps;
  const index = (t) => {
    let i = Math.floor(Math.max(0, t) * speed * fps + 1e-6);
    if (loop) i %= count;
    return Math.min(count - 1, i);
  };
  const name = (i) => `${dir}/${String(i + 1).padStart(5, '0')}.${meta.ext}`;
  return {
    ...meta,
    duration: count / fps,
    at: (t) => image(name(index(t))),
    /** Preload frames for [from, to) seconds (optional, speeds up seeking). */
    preload: (from = 0, to = count / fps) => {
      const jobs = [];
      for (let i = index(from); i <= index(to); i++) jobs.push(image(name(i)));
      return Promise.all(jobs);
    },
  };
}

/** Draw an image with object-fit: cover into a canvas rect, optional focal point and zoom. */
export function drawCover(ctx, img, x, y, w, h, { fx = 0.5, fy = 0.5, zoom = 1 } = {}) {
  const ir = img.naturalWidth / img.naturalHeight, r = w / h;
  let sw = img.naturalWidth, sh = img.naturalHeight;
  if (ir > r) sw = sh * r; else sh = sw / r;
  sw /= zoom; sh /= zoom;
  const sx = (img.naturalWidth - sw) * fx, sy = (img.naturalHeight - sh) * fy;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}
