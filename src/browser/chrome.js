// A minimal Chrome DevTools Protocol client over --remote-debugging-pipe.
// No Playwright, no WebSocket: Chrome reads commands on fd 3 and writes replies on fd 4,
// each message a JSON document terminated by a NUL byte.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Candidate browser executables, most deterministic first. */
async function candidates() {
  const list = [];
  if (process.env.THESIUM_CHROME) list.push(process.env.THESIUM_CHROME);
  const home = os.homedir();
  const pw =
    process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright')
      : process.platform === 'darwin'
        ? path.join(home, 'Library', 'Caches', 'ms-playwright')
        : path.join(home, '.cache', 'ms-playwright');
  // Playwright's chrome-headless-shell is ideal when present: no UI, stable rendering.
  const shells = (await readdir(pw).catch(() => []))
    .filter((d) => d.startsWith('chromium_headless_shell-'))
    .sort()
    .reverse();
  for (const dir of shells) {
    const base = path.join(pw, dir);
    for (const sub of await readdir(base).catch(() => [])) {
      const exe =
        process.platform === 'win32'
          ? path.join(base, sub, 'chrome-headless-shell.exe')
          : path.join(base, sub, 'chrome-headless-shell');
      list.push(exe);
    }
  }
  if (process.platform === 'win32') {
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const local = process.env.LOCALAPPDATA || '';
    list.push(
      path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    );
  } else if (process.platform === 'darwin') {
    list.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    );
  } else {
    for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'])
      for (const dir of (process.env.PATH || '').split(':')) list.push(path.join(dir, name));
  }
  return list;
}

/** Path of a usable Chromium-family browser, or undefined. */
export async function findChrome() {
  for (const file of await candidates()) if (file && existsSync(file)) return file;
  return undefined;
}

/**
 * @typedef {{ send: (method: string, params?: object) => Promise<any>,
 *   on: (event: string, handler: (params: any) => void) => void, id: string }} Session
 */

/**
 * Launches a headless browser and returns a connection that can open pages.
 * @param {{ gpu?: boolean, executable?: string }} [options]
 */
export async function launch(options = {}) {
  const executable = options.executable || (await findChrome());
  if (!executable)
    throw new Error(
      'No Chrome, Edge or Chromium found. Install Chrome, or set THESIUM_CHROME to a Chromium-family browser.',
    );
  const profile = await mkdtemp(path.join(os.tmpdir(), 'thesium-chrome-'));
  const gpu = options.gpu ?? process.env.THESIUM_GPU !== '0';
  const shell = /headless-shell/i.test(executable);
  const args = [
    ...(shell ? [] : ['--headless']),
    '--remote-debugging-pipe',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-sync',
    '--disable-features=Translate,MediaRouter,OptimizationHints,AutofillServerCommunication',
    '--metrics-recording-only',
    '--mute-audio',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    '--autoplay-policy=no-user-gesture-required',
    ...(gpu
      ? ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=default']
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
    'about:blank',
  ];
  const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  const stderr = [];
  child.stderr?.on('data', (d) => stderr.length < 200 && stderr.push(String(d)));
  const input = /** @type {import('node:stream').Writable} */ (child.stdio[3]);
  const output = /** @type {import('node:stream').Readable} */ (child.stdio[4]);
  let nextId = 0;
  /** @type {Map<number, {resolve: (v: any) => void, reject: (e: Error) => void, method: string}>} */
  const pending = new Map();
  /** @type {Map<string, Map<string, Array<(p: any) => void>>>} */
  const listeners = new Map();
  let buffer = Buffer.alloc(0);
  let closed = false;

  output.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    let end;
    while ((end = buffer.indexOf(0)) >= 0) {
      const message = JSON.parse(buffer.subarray(0, end).toString('utf8'));
      buffer = buffer.subarray(end + 1);
      if (message.id !== undefined) {
        const waiter = pending.get(message.id);
        if (!waiter) continue;
        pending.delete(message.id);
        if (message.error) waiter.reject(new Error(`${waiter.method}: ${message.error.message}`));
        else waiter.resolve(message.result);
      } else {
        const handlers = listeners.get(message.sessionId || '')?.get(message.method) || [];
        for (const handler of handlers) handler(message.params);
      }
    }
  });
  const exited = new Promise((resolve) => child.on('exit', resolve));
  child.on('exit', () => {
    closed = true;
    for (const waiter of pending.values())
      waiter.reject(new Error(`Browser exited. ${stderr.join('').slice(-800)}`));
    pending.clear();
  });

  /** @param {string} sessionId */
  const session = (sessionId) => {
    /** @type {Session} */
    const s = {
      id: sessionId,
      send(method, params = {}) {
        if (closed) return Promise.reject(new Error('Browser is closed'));
        const id = ++nextId;
        const message = { id, method, params, ...(sessionId ? { sessionId } : {}) };
        return new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject, method });
          input.write(JSON.stringify(message) + '\0');
        });
      },
      on(event, handler) {
        if (!listeners.has(sessionId)) listeners.set(sessionId, new Map());
        const byEvent = /** @type {Map<string, Array<(p: any) => void>>} */ (listeners.get(sessionId));
        if (!byEvent.has(event)) byEvent.set(event, []);
        byEvent.get(event)?.push(handler);
      },
    };
    return s;
  };
  const browser = session('');
  // The first command doubles as a readiness probe.
  const version = await browser.send('Browser.getVersion');

  return {
    executable,
    version: /** @type {string} */ (version.product),
    browser,
    /** A session for a target attached with flatten: true. @param {string} sessionId */
    attach: (sessionId) => session(sessionId),
    /** Opens a new page (tab) and returns its session. */
    async newPage() {
      const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
      const page = session(sessionId);
      return Object.assign(page, {
        targetId,
        close: () => browser.send('Target.closeTarget', { targetId }).catch(() => {}),
      });
    },
    async close() {
      if (!closed) {
        await browser.send('Browser.close').catch(() => {});
        const timer = setTimeout(() => child.kill(), 3000);
        await exited;
        clearTimeout(timer);
      }
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    },
  };
}
