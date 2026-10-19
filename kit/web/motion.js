// Thesium motion kit for web films. Every function is pure: same inputs, same output, any order.
// Import from a film page: import { ease, spring, track } from '/kit/web/motion.js';

export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => (a === b ? 0 : (x - a) / (b - a));
export const remap = (x, a, b, c, d) => lerp(c, d, clamp(invLerp(a, b, x)));
/** 0→1 progress of t across [a, b], clamped. */
export const seg = (t, a, b) => clamp((t - a) / (b - a));
/** 0→1→0 envelope inside [a, b] with fade-in and fade-out durations. */
export const env = (t, a, b, fadeIn = 0.3, fadeOut = 0.3) =>
  Math.min(seg(t, a, a + fadeIn), 1 - seg(t, b - fadeOut, b));

// ── Easing ────────────────────────────────────────────────────────────────
const bezier = (x1, y1, x2, y2) => (x) => {
  // Solve x(s) = x by Newton iterations, then evaluate y(s).
  let s = x;
  for (let i = 0; i < 6; i++) {
    const cx = 3 * x1 * s * (1 - s) ** 2 + 3 * x2 * s * s * (1 - s) + s ** 3 - x;
    const dx = 3 * x1 * (1 - s) ** 2 + 6 * (x2 - x1) * s * (1 - s) + 3 * (1 - x2) * s * s;
    if (Math.abs(dx) < 1e-6) break;
    s = clamp(s - cx / dx);
  }
  return 3 * y1 * s * (1 - s) ** 2 + 3 * y2 * s * s * (1 - s) + s ** 3;
};
export const ease = {
  linear: (t) => clamp(t),
  in: (t) => clamp(t) ** 3,
  out: (t) => 1 - (1 - clamp(t)) ** 3,
  inOut: (t) => ((t = clamp(t)), t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  outQuart: (t) => 1 - (1 - clamp(t)) ** 4,
  outQuint: (t) => 1 - (1 - clamp(t)) ** 5,
  outExpo: (t) => (clamp(t) === 1 ? 1 : 1 - 2 ** (-10 * clamp(t))),
  inOutExpo: (t) => {
    t = clamp(t);
    if (t === 0 || t === 1) return t;
    return t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2;
  },
  outBack: (t, s = 1.70158) => ((t = clamp(t) - 1), 1 + t * t * ((s + 1) * t + s)),
  smooth: (t) => ((t = clamp(t)), t * t * (3 - 2 * t)),
  smoother: (t) => ((t = clamp(t)), t * t * t * (t * (t * 6 - 15) + 10)),
  /** Precise "print" ease used by Swiss and editorial motion. */
  snap: bezier(0.7, 0, 0.2, 1),
  /** Material-style emphasized decelerate. */
  emphasized: bezier(0.05, 0.7, 0.1, 1),
  bezier,
};

// ── Springs (closed form; no frame-to-frame state) ────────────────────────
/** Step response 0→1, x = seconds since the target changed. w: stiffness (rad/s), z: damping ratio. */
export function spring(x, w = 16, z = 0.72) {
  if (x <= 0) return 0;
  if (z >= 1) return 1 - Math.exp(-w * x) * (1 + w * x);
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * x) * (Math.cos(wd * x) + ((z * w) / wd) * Math.sin(wd * x));
}
export const springs = {
  crisp: { w: 24, z: 0.8 },
  default: { w: 15, z: 0.72 },
  heavy: { w: 10, z: 0.92 },
  playful: { w: 18, z: 0.45 },
};
/**
 * A value that springs to a sequence of targets: keys = [[time, value], ...].
 * v(t) = v0 + Σ (v_i − v_{i−1}) · spring(t − t_i). Stays a pure function of t.
 */
export function springTo(t, keys, { w = 15, z = 0.72 } = {}) {
  let v = keys[0][1];
  for (let i = 1; i < keys.length; i++) v += (keys[i][1] - keys[i - 1][1]) * spring(t - keys[i][0], w, z);
  return v;
}

// ── Keyframe tracks ───────────────────────────────────────────────────────
/** Keyframes [[t, value, easeFn?], ...] for numbers or arrays of numbers. */
export function track(keys) {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1, fn = ease.inOut] = keys[i];
      const [t0, v0] = keys[i - 1];
      if (t <= t1) {
        const p = fn(seg(t, t0, t1));
        return Array.isArray(v0) ? v0.map((a, j) => lerp(a, v1[j], p)) : lerp(v0, v1, p);
      }
    }
    return keys[keys.length - 1][1];
  };
}
/** Start time for item i of n when staggering across [start, start+spread]. */
export const stagger = (i, n, start, spread, fn = (x) => x) => start + fn(n <= 1 ? 0 : i / (n - 1)) * spread;

// ── Deterministic randomness and noise ────────────────────────────────────
/** Seeded PRNG (mulberry32). rand(7)() → same sequence every time. */
export function rand(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Stateless hash of a number to [0, 1). */
export const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
export const hash2 = (x, y) => hash(x * 12.9898 + y * 78.233);
/** Smooth 1D value noise. */
export const noise = (x) => {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash(i), hash(i + 1), u);
};
/** Smooth 2D value noise. */
export function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash2(ix, iy), hash2(ix + 1, iy), ux), lerp(hash2(ix, iy + 1), hash2(ix + 1, iy + 1), ux), uy);
}
/** Fractal noise. */
export const fbm = (x, y = 0, octaves = 4) => {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < octaves; i++, a *= 0.5, f *= 2) v += a * noise2(x * f, y * f);
  return v;
};
/** Hand-made jitter that changes `rate` times per second (e.g. 12 for drawn animation). */
export const boil = (t, seed = 0, rate = 12, amount = 1) => (hash(Math.floor(t * rate) * 13.37 + seed) - 0.5) * 2 * amount;

// ── Music time ────────────────────────────────────────────────────────────
/** Beat helpers for a constant tempo starting at `offset` seconds. */
export function beatGrid(bpm, offset = 0, beatsPerBar = 4) {
  const spb = 60 / bpm;
  return {
    spb,
    beat: (n) => offset + n * spb,
    bar: (n) => offset + n * beatsPerBar * spb,
    at: (t) => (t - offset) / spb,
    /** 1→0 decay after each beat; use for pulses. */
    pulse: (t, decay = 6) => {
      const b = (t - offset) / spb;
      return b < 0 ? 0 : Math.exp(-decay * (b - Math.floor(b)) * spb);
    },
  };
}

// ── Layout and camera ─────────────────────────────────────────────────────
/** Viewport-relative units so one layout serves 16:9, 9:16 and 1:1. */
export function frame() {
  const W = innerWidth, H = innerHeight, m = Math.min(W, H);
  return { W, H, m, portrait: H > W, vw: W / 100, vh: H / 100, vmin: m / 100 };
}
/** CSS transform for a 2D camera looking at world point (x, y). */
export const camera2d = ({ x = 0, y = 0, zoom = 1, rot = 0 }, W = innerWidth, H = innerHeight) =>
  `translate(${W / 2}px, ${H / 2}px) rotate(${rot}rad) scale(${zoom}) translate(${-x}px, ${-y}px)`;
/** Apply styles to an element from a plain object (numbers become px where sensible). */
export function css(el, styles) {
  for (const [k, v] of Object.entries(styles)) el.style[k] = v;
  return el;
}
/** Clip-reveal text: returns per-word spans for staggered reveals. */
export function splitWords(el) {
  const words = el.textContent.split(/(\s+)/);
  el.textContent = '';
  return words.map((w) => {
    if (/^\s+$/.test(w)) {
      el.append(w);
      return null;
    }
    const mask = document.createElement('span');
    mask.style.display = 'inline-block';
    mask.style.overflow = 'hidden';
    mask.style.verticalAlign = 'bottom';
    const inner = document.createElement('span');
    inner.style.display = 'inline-block';
    inner.textContent = w;
    mask.append(inner);
    el.append(mask);
    return inner;
  }).filter(Boolean);
}

// ── The film ──────────────────────────────────────────────────────────────
/** Size, timing and tuned parameters, set by Thesium before the page loads. */
export const film = () => /** @type {any} */ (globalThis).THESIUM ?? { width: innerWidth, height: innerHeight, fps: 30, duration: 10, params: {} };
/** Tunable values declared in thesium.json → params (the studio can change them). */
export const params = () => film().params ?? {};
/**
 * The shared clock in /timeline.json: tempo, named sections and cues. Load it before
 * window.ready so picture and sound read the same numbers.
 */
export async function timeline() {
  const response = await fetch('/timeline.json');
  const data = response.ok ? await response.json() : {};
  const sections = (data.sections ?? []).slice().sort((a, b) => a.start - b.start);
  const grid = data.bpm ? beatGrid(data.bpm, data.offset ?? 0, data.beatsPerBar ?? 4) : undefined;
  return {
    ...data,
    sections,
    grid,
    /** The section playing at t, with local progress 0→1. */
    at(t) {
      let i = sections.length - 1;
      while (i > 0 && sections[i].start > t) i--;
      const s = sections[i];
      const end = sections[i + 1]?.start ?? film().duration;
      return s ? { ...s, index: i, end, p: clamp((t - s.start) / (end - s.start)) } : undefined;
    },
  };
}
