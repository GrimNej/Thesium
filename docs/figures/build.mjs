// Renders the guide's figures: each page in docs/figures/src/ becomes a PNG in docs/figures/,
// drawn by Thesium's own headless Chrome client with the bundled fonts. Pages may be any height:
// the screenshot is the page's #figure element. Run: node docs/figures/build.mjs [name…]
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../../src/browser/chrome.js';
import { serve } from '../../src/browser/server.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const src = path.join(here, 'src');
const only = process.argv.slice(2);
const pages = (await readdir(src)).filter((f) => f.endsWith('.html') && (!only.length || only.includes(f.replace(/\.html$/, ''))));

const server = await serve(src, { mounts: { '/fonts': path.join(root, 'fonts'), '/media': path.join(root, 'docs', 'media'), '/examples': path.join(root, 'examples') } });
const browser = await launch();
try {
  for (const file of pages) {
    const page = await browser.newPage();
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
    await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    await page.send('Page.navigate', { url: `${server.origin}/${file}` });
    const { result } = await page.send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const go = async () => {
          if (window.figureReady) await window.figureReady; // pages that draw from data
          await document.fonts.ready;
          await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const r = document.getElementById('figure').getBoundingClientRect();
          resolve({ x: r.left, y: r.top, width: Math.ceil(r.width), height: Math.ceil(r.height), scale: Number(document.body.dataset.scale || 1) });
        };
        document.readyState === 'complete' ? go() : addEventListener('load', go);
      })`,
      awaitPromise: true,
      returnByValue: true,
    });
    const box = result.value;
    await page.send('Emulation.setDeviceMetricsOverride', { width: Math.max(1600, box.width + box.x), height: box.height + box.y, deviceScaleFactor: box.scale, mobile: false });
    const shot = await page.send('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 1 }, captureBeyondViewport: true });
    const out = path.join(here, file.replace(/\.html$/, '.png'));
    await writeFile(out, Buffer.from(shot.data, 'base64'));
    console.log(`${path.relative(root, out).replaceAll('\\', '/')}  ${box.width * box.scale}×${box.height * box.scale}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
