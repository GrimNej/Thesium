// web: any page that draws the frame for a time. DOM, SVG, Canvas, WebGL, Three.js, p5, GSAP…
// Contract: the page sets window.ready = true and defines window.render(t) (may be async).
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { launch, findChrome } from '../browser/chrome.js';
import { serve } from '../browser/server.js';
import { FONT_DIR, inside } from '../core/paths.js';
import { filmInfo } from '../core/manifest.js';
import { vendorSetup } from '../core/vendor.js';
import { scan } from './index.js';

const RULES = [
  { pattern: /Math\.random\s*\(/, level: 'error', message: 'Math.random() makes frames unrepeatable; use rand(seed) from /kit/web/motion.js' },
  { pattern: /\b(Date\.now|performance\.now)\s*\(|new Date\s*\(\s*\)/, level: 'error', message: 'Wall-clock time breaks seeking; derive everything from t' },
  { pattern: /\b(setTimeout|setInterval|requestAnimationFrame)\s*\(/, level: 'error', message: 'Timers and animation loops are not seekable; draw everything inside render(t)' },
  { pattern: /\.setAnimationLoop\s*\(/, level: 'error', message: 'Three.js animation loops are not seekable; call renderer.render() inside render(t)' },
  {
    pattern: /(?:\b(?:src|href|srcset|poster)\s*=\s*['"`]?|url\(\s*['"]?|\bfrom\s+['"]|\bimport\s*\(\s*['"`]|\bfetch\s*\(\s*['"`])\s*(?:https?:)?\/\/(?!www\.w3\.org)/i,
    level: 'error',
    message: 'Remote URLs are blocked while rendering; put the file in assets/ (or `thesium add <library>`)',
  },
  { pattern: /@keyframes|animation\s*:\s*[a-z]|transition\s*:\s*(?!none)[a-z]/i, level: 'warning', message: 'CSS animations and transitions run on wall-clock time; compute styles in render(t)' },
  { pattern: /\.play\s*\(\s*\)/, level: 'warning', message: 'Media playback is not frame-accurate; use frames() from /kit/web/media.js' },
];

/** @param {string} dir @returns {Promise<string[]>} */
async function sourceFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'vendor') continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourceFiles(file)));
    else if (/\.(html?|m?js|css)$/i.test(entry.name)) out.push(file);
  }
  return out;
}

const STARTER = (m) => `<!doctype html>
<html lang="${m.language || 'en'}">
<head>
<meta charset="utf-8">
<title>${m.title}</title>
<style>
  @font-face { font-family: 'Inter'; src: url('/thesium/fonts/Inter.ttf'); font-weight: 100 900; }
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }
  #stage { position: absolute; inset: 0; }
</style>
</head>
<body>
<div id="stage"></div>
<script type="module">
// Contract: everything on screen is a pure function of t (seconds). Build the scene once,
// then render(t) sets its state for any t, in any order. See the web engine guide.
import { ease, seg } from '/kit/web/motion.js';

const { width, height, duration, params } = window.THESIUM;

await document.fonts.ready;

window.render = (t) => {
  // derive everything from t
};
window.ready = true;
</script>
</body>
</html>
`;

/** @type {import('./index.js').Engine} */
export const webEngine = {
  id: 'web',
  label: 'Web (HTML, Canvas, WebGL, Three.js)',
  summary: 'Anything a browser can draw, captured frame-exactly by headless Chrome',
  guide: 'engines/web.md',

  async detect() {
    const chrome = await findChrome();
    if (!chrome)
      return { ok: false, detail: 'No Chrome, Edge or Chromium found', fix: 'Install Google Chrome, or set THESIUM_CHROME to a Chromium-family browser' };
    return { ok: true, detail: chrome };
  },

  async scaffold(workspace, m) {
    const file = inside(workspace, m.entry);
    await mkdir(path.dirname(file), { recursive: true });
    if (await stat(file).catch(() => undefined)) return [];
    await writeFile(file, STARTER(m));
    return [m.entry];
  },

  async lint(workspace, m) {
    /** @type {import('./index.js').Finding[]} */
    const findings = [];
    const entry = inside(workspace, m.entry);
    if (!(await stat(entry).catch(() => undefined))) return [{ level: 'error', message: `Entry not found: ${m.entry}` }];
    const html = await readFile(entry, 'utf8');
    if (!/window\.render\s*=/.test(html) && !/window\.render\s*=/.test(await allSource(workspace, m)))
      findings.push({ level: 'error', message: 'The film never assigns window.render = (t) => …' });
    if (!/window\.ready\s*=\s*true/.test(await allSource(workspace, m)))
      findings.push({ level: 'error', message: 'The film never sets window.ready = true' });
    for (const file of await sourceFiles(path.dirname(entry)))
      findings.push(...scan(await readFile(file, 'utf8'), path.relative(workspace, file).replaceAll('\\', '/'), /** @type {any} */ (RULES)));
    return findings;
  },

  async open(workspace, m, o) {
    const info = filmInfo(m, o.params);
    const pinned = m.engineOptions?.web?.vendor || {};
    const vendor = vendorSetup(pinned);
    const inject =
      `<script>window.THESIUM=${JSON.stringify(info)};</script>` +
      (Object.keys(vendor.imports).length ? `<script type="importmap">${JSON.stringify({ imports: vendor.imports })}</script>` : '');
    const server = await serve(workspace, { mounts: { '/thesium/fonts': FONT_DIR, ...vendor.mounts }, inject });
    const browser = await launch();
    const origin = server.origin;
    const url = `${origin}/${m.entry.replaceAll('\\', '/')}`;
    const scale = o.scale && o.scale > 0 ? o.scale : 1;
    const parallel = Math.max(1, Math.min(Number(process.env.THESIUM_WORKERS) || 6, Math.floor(os.cpus().length / 2) || 1));
    /** @type {Array<Promise<any>>} */
    const pages = [];

    const openPage = async () => {
      const { browserContextId } = await browser.browser.send('Target.createBrowserContext', {});
      const { targetId } = await browser.browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
      const { sessionId } = await browser.browser.send('Target.attachToTarget', { targetId, flatten: true });
      const page = browser.attach(sessionId);
      /** @type {string[]} */
      const errors = [];
      page.on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'exception'));
      page.on('Runtime.consoleAPICalled', (p) => {
        if (p.type === 'error' || p.type === 'warning')
          o.log?.(`page ${p.type}: ${(p.args || []).map((a) => a.value ?? a.description ?? '').join(' ')}`.slice(0, 400));
      });
      page.on('Fetch.requestPaused', (p) => {
        const allowed = p.request.url.startsWith(origin) || p.request.url.startsWith('data:') || p.request.url.startsWith('blob:');
        if (!allowed) o.log?.(`blocked remote request: ${p.request.url.slice(0, 160)}`);
        page
          .send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', allowed ? { requestId: p.requestId } : { requestId: p.requestId, errorReason: 'BlockedByClient' })
          .catch(() => {});
      });
      await page.send('Runtime.enable');
      await page.send('Page.enable');
      await page.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
      await page.send('Emulation.setDeviceMetricsOverride', { width: m.width, height: m.height, deviceScaleFactor: scale, mobile: false });
      await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 1 } });
      await page.send('Page.navigate', { url });
      const ready = await page.send('Runtime.evaluate', {
        expression: `new Promise((resolve) => {
          const started = performance.now();
          const check = () => {
            if (window.ready === true) return document.fonts.ready.then(() => resolve(typeof window.render === 'function' ? 'ok' : 'no-render'));
            if (performance.now() - started > ${Number(process.env.THESIUM_READY_TIMEOUT) || 120000}) return resolve('timeout');
            setTimeout(check, 25);
          };
          check();
        })`,
        awaitPromise: true,
        returnByValue: true,
      });
      const state = ready.result?.value;
      if (state !== 'ok') {
        const why = state === 'no-render' ? 'The film does not define window.render(t).' : 'The film never set window.ready = true.';
        throw new Error(`${why}${errors.length ? ` Page errors: ${errors.join(' | ').slice(0, 1500)}` : ''}`);
      }
      if (errors.length) throw new Error(`Page errors while loading: ${errors.join(' | ').slice(0, 1500)}`);
      return { page, errors };
    };

    return {
      format: 'jpeg',
      parallel,
      async frame(t, slot = 0) {
        const index = slot % parallel;
        pages[index] ??= openPage();
        const { page, errors } = await pages[index];
        const result = await page.send('Runtime.evaluate', {
          expression: `(async () => { await window.render(${Number(t)}); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); })()`,
          awaitPromise: true,
          returnByValue: true,
        });
        if (result.exceptionDetails)
          throw new Error(`render(${t}) threw: ${result.exceptionDetails.exception?.description || result.exceptionDetails.text}`);
        if (errors.length) throw new Error(`Page error at t=${t}: ${errors.splice(0).join(' | ').slice(0, 1200)}`);
        const shot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 95, optimizeForSpeed: false });
        return Buffer.from(shot.data, 'base64');
      },
      async close() {
        await browser.close();
        await server.close();
      },
    };
  },
};

/** Concatenated film source, for whole-program checks. */
async function allSource(workspace, m) {
  const entry = inside(workspace, m.entry);
  const files = await sourceFiles(path.dirname(entry));
  return (await Promise.all(files.map((f) => readFile(f, 'utf8')))).join('\n');
}
