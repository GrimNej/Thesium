// Frame check: empty bands at the frame edges, pictures that stop short of the frame, and
// flat colour fields. Measured on raw pixels, so it works on any engine's output.
import { rawFrames } from '../media/ffmpeg.js';

const W = 480;

/** @param {Buffer} rgb @param {number} w @param {number} h */
function luma(rgb, w, h) {
  const out = new Float32Array(w * h);
  for (let i = 0, p = 0; i < out.length; i++, p += 3) out[i] = 0.2126 * rgb[p] + 0.7152 * rgb[p + 1] + 0.0722 * rgb[p + 2];
  return out;
}

/** Mean and standard deviation of a line of luma. */
function lineStats(L, w, h, index, vertical) {
  let sum = 0;
  let sq = 0;
  const n = vertical ? h : w;
  for (let k = 0; k < n; k++) {
    const v = vertical ? L[k * w + index] : L[index * w + k];
    sum += v;
    sq += v * v;
  }
  const mean = sum / n;
  return { mean, std: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
}

/**
 * Width (fraction) of a black band at one edge that ends in a hard step into picture.
 * A designed dark margin fades in; an unfilled frame jumps straight into a picture.
 */
function band(L, w, h, edge) {
  const vertical = edge === 'left' || edge === 'right';
  const count = vertical ? w : h;
  const order = edge === 'right' || edge === 'bottom' ? Array.from({ length: count }, (_, i) => count - 1 - i) : Array.from({ length: count }, (_, i) => i);
  let n = 0;
  for (const k of order) {
    const s = lineStats(L, w, h, k, vertical);
    if (s.mean < 10 && s.std < 4) n++;
    else break;
  }
  if (n < 2 || n >= count - 4) return 0;
  const inner = order.slice(n + 1, n + 1 + Math.max(3, Math.floor(count / 30)));
  const innerMean = inner.reduce((a, k) => a + lineStats(L, w, h, k, vertical).mean, 0) / inner.length;
  const edgeMean = lineStats(L, w, h, order[n - 1], vertical).mean;
  return innerMean - edgeMean > 12 ? n / count : 0;
}

/**
 * Share of the frame covered by one featureless, non-black colour (an empty panel or colour
 * field). Cells are flat when they have no detail; flat cells only count together when they are
 * the same colour, so a soft gradient or fog that changes across the frame is not "empty".
 */
function flatShare(rgb, w, h) {
  const rows = 6;
  const cols = 8;
  /** @type {number[][]} */
  const flatColours = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor((c * w) / cols);
      const x1 = Math.floor(((c + 1) * w) / cols);
      const y0 = Math.floor((r * h) / rows);
      const y1 = Math.floor(((r + 1) * h) / rows);
      const sum = [0, 0, 0];
      const sq = [0, 0, 0];
      let n = 0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const p = (y * w + x) * 3;
          for (let ch = 0; ch < 3; ch++) {
            sum[ch] += rgb[p + ch];
            sq[ch] += rgb[p + ch] * rgb[p + ch];
          }
          n++;
        }
      const mean = sum.map((s) => s / n);
      const std = sq.map((s, ch) => Math.sqrt(Math.max(0, s / n - mean[ch] * mean[ch])));
      const stdMean = (std[0] + std[1] + std[2]) / 3;
      const lit = (mean[0] + mean[1] + mean[2]) / 3 > 14;
      const coloured = Math.max(...mean) - Math.min(...mean) > 6;
      if (stdMean < 3.5 && (lit || coloured)) flatColours.push(mean);
    }
  // The largest group of flat cells within a small colour distance of each other.
  let largest = 0;
  for (const a of flatColours) {
    let same = 0;
    for (const b of flatColours) if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 6) same++;
    largest = Math.max(largest, same);
  }
  return largest / (rows * cols);
}

/** @param {Buffer} rgb @param {number} w @param {number} h */
export function inspectFrame(rgb, w, h) {
  const L = luma(rgb, w, h);
  let sum = 0;
  let sq = 0;
  for (const v of L) {
    sum += v;
    sq += v * v;
  }
  const mean = sum / L.length;
  const std = Math.sqrt(Math.max(0, sq / L.length - mean * mean));
  if (std < 7) {
    // Colour variation too? A hue gradient at equal luma is still a picture.
    let cs = 0;
    for (let ch = 0; ch < 3; ch++) {
      let s = 0;
      let q = 0;
      for (let p = ch; p < rgb.length; p += 3) {
        s += rgb[p];
        q += rgb[p] * rgb[p];
      }
      const n = rgb.length / 3;
      cs += Math.sqrt(Math.max(0, q / n - (s / n) ** 2));
    }
    if (cs / 3 < 7) return ['flat frame (one colour fills the screen)'];
  }
  const issues = [];
  const share = flatShare(rgb, w, h);
  if (share >= 0.2) issues.push(`large empty area (${Math.round(share * 100)}% of the frame is a flat colour field)`);
  for (const edge of ['left', 'right', 'top', 'bottom']) {
    const width = band(L, w, h, edge);
    if (width > 0.01) issues.push(`picture stops short of the ${edge} edge (${Math.round(width * 100)}% black band)`);
  }
  return issues;
}

/**
 * Scans a video and returns problem ranges, ignoring blips shorter than half a second.
 * @param {string} video
 * @param {{ fps?: number, offset?: number }} [o] offset is added to reported times
 * @returns {Promise<Array<{ start: number, end: number, issue: string }>>}
 */
export async function frameCheck(video, o = {}) {
  const fps = o.fps || 2;
  const step = 1 / fps;
  /** @type {Array<[number, number, string]>} */
  const ranges = [];
  for await (const frame of rawFrames(video, { width: W, fps })) {
    const t = frame.index / fps;
    for (const issue of inspectFrame(frame.rgb, frame.width, frame.height)) {
      const kind = issue.split(' (')[0];
      const last = [...ranges].reverse().find((r) => r[2].split(' (')[0] === kind);
      if (last && t - last[1] <= step * 1.5) last[1] = t;
      else ranges.push([t, t, issue]);
    }
  }
  const offset = o.offset || 0;
  return ranges
    .filter(([a, b]) => b + step - a >= 0.5)
    .map(([a, b, issue]) => ({ start: Number((a + offset).toFixed(2)), end: Number((b + step + offset).toFixed(2)), issue }))
    .sort((x, y) => x.start - y.start);
}
