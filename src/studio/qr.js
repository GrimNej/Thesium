// Real, scannable QR codes for calls to action (never draw a fake one). PNG or SVG, any colours.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import qrcodegen from '../vendor/qrcodegen.js';
import { inside, rel } from '../core/paths.js';
import { run } from '../core/proc.js';
import { ffmpeg } from '../media/ffmpeg.js';

/** @param {string} hex */
const rgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

/**
 * @param {string} ws
 * @param {string} text what the code holds (usually a URL from the sources)
 * @param {{ out?: string, size?: number, dark?: string, light?: string, margin?: number, ecc?: 'L' | 'M' | 'Q' | 'H' }} [o]
 * @returns {Promise<{ text: string, files: string[] }>}
 */
export async function qr(ws, text, o = {}) {
  if (!text) throw new Error('Usage: qr "<url or text>" [--out assets/qr.png] [--size 600] [--dark #000000] [--light #ffffff]');
  const ecc = { L: qrcodegen.QrCode.Ecc.LOW, M: qrcodegen.QrCode.Ecc.MEDIUM, Q: qrcodegen.QrCode.Ecc.QUARTILE, H: qrcodegen.QrCode.Ecc.HIGH }[o.ecc || 'M'];
  const code = qrcodegen.QrCode.encodeText(text, ecc);
  const margin = o.margin ?? 4; // the quiet zone scanners need, in modules
  const n = code.size + margin * 2;
  const dark = o.dark || '#000000';
  const light = o.light || '#ffffff';
  const out = inside(ws, o.out || 'assets/qr.png');
  await mkdir(path.dirname(out), { recursive: true });
  if (out.toLowerCase().endsWith('.svg')) {
    let d = '';
    for (let y = 0; y < code.size; y++)
      for (let x = 0; x < code.size; x++) if (code.getModule(x, y)) d += `M${x + margin},${y + margin}h1v1h-1z`;
    await writeFile(out, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>\n`);
  } else {
    const [dr, dg, db] = rgb(dark);
    const [lr, lg, lb] = rgb(light);
    const pixels = Buffer.alloc(n * n * 3);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const on = x >= margin && y >= margin && x < n - margin && y < n - margin && code.getModule(x - margin, y - margin);
        pixels.set(on ? [dr, dg, db] : [lr, lg, lb], (y * n + x) * 3);
      }
    const size = Math.max(n, Math.round((o.size || 600) / n) * n); // whole pixels per module
    await run(ffmpeg(), ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${n}x${n}`, '-i', '-', '-vf', `scale=${size}:${size}:flags=neighbor`, '-frames:v', '1', out], { input: pixels });
  }
  return {
    text: `${rel(ws, out)}: QR version ${code.version} (${code.size}×${code.size} modules, ECC ${o.ecc || 'M'}) for ${text}. Keep the quiet zone, and contrast high: dark modules on a light field scan best.`,
    files: [out],
  };
}
