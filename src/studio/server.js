// The review studio: a local page built from the film itself. Play any version, pin notes on
// the timeline (each saves the exact frame), and tune the parameters the director exposed,
// seeing the result on a real frame before applying it. Only out/, review/ and assets/ are served.
import { spawn } from 'node:child_process';
import { existsSync, watch } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { serve } from '../browser/server.js';
import { UI_DIR, rel } from '../core/paths.js';
import { loadManifest, saveManifest, resolveParams } from '../core/manifest.js';
import { loadTimeline } from '../core/workspace.js';
import { grabFrames } from '../media/ffmpeg.js';
import * as ops from './ops.js';

const SERVED = ['out/', 'review/', 'assets/'];

/** @param {import('node:http').IncomingMessage} req */
async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

/** @param {import('node:http').ServerResponse} res @param {number} code @param {any} data */
function json(res, code, data) {
  const out = Buffer.from(JSON.stringify(data));
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(out.length), 'Cache-Control': 'no-store' });
  res.end(out);
}

/**
 * Starts the studio for one film.
 * @param {string} ws
 * @param {{ port?: number, open?: boolean }} [o]
 */
export async function startStudio(ws, o = {}) {
  const m = await loadManifest(ws);
  const notesDir = path.join(ws, 'review', 'notes');
  const notesFile = path.join(notesDir, 'notes.json');
  /** @type {Set<import('node:http').ServerResponse>} */
  const clients = new Set();
  const broadcast = (event, data) => {
    for (const c of clients) c.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  /** One render job at a time: preview or master. */
  let job = null;

  const film = async () => {
    const manifest = await loadManifest(ws);
    const timeline = await loadTimeline(ws);
    const outs = (await readdir(path.join(ws, 'out')).catch(() => [])).filter((f) => /-v\d+\.mp4$/.test(f));
    outs.sort((a, b) => Number(/-v(\d+)/.exec(b)?.[1]) - Number(/-v(\d+)/.exec(a)?.[1]));
    const versions = [];
    for (const f of outs) {
      const meta = JSON.parse(await readFile(path.join(ws, 'out', f.replace(/\.mp4$/, '.json')), 'utf8').catch(() => '{}'));
      versions.push({
        label: `v${/-v(\d+)/.exec(f)?.[1]}`,
        url: `/out/${f}`,
        poster: meta.poster ? `/${rel(ws, meta.poster)}` : undefined,
        issues: meta.issues || [],
        sound: meta.sound || null,
        at: meta.renderSeconds,
      });
    }
    if (existsSync(path.join(ws, 'review', 'preview.mp4'))) versions.push({ label: 'preview', url: '/review/preview.mp4', issues: [], sound: null });
    return {
      title: manifest.title,
      engine: manifest.engine,
      width: manifest.width,
      height: manifest.height,
      fps: manifest.fps,
      duration: manifest.duration,
      params: manifest.params,
      timeline,
      versions,
      notes: await ops.readNotes(ws),
      status: (await ops.status(ws)).text,
      job: job && { kind: job.kind, done: job.done, total: job.total },
    };
  };

  const saveNotes = async (notes) => {
    await mkdir(notesDir, { recursive: true });
    await writeFile(notesFile, JSON.stringify(notes, null, 1));
    broadcast('notes', notes);
  };

  /** Runs preview or master in the background and streams progress. */
  const startJob = (kind) => {
    if (job) throw new Error(`A ${job.kind} is already running`);
    job = { kind, done: 0, total: 0 };
    broadcast('job', job);
    const onProgress = (done, total) => {
      job.done = done;
      job.total = total;
      broadcast('job', job);
    };
    const run = kind === 'master' ? ops.master(ws, { onProgress }) : ops.preview(ws, { onProgress });
    run
      .then(async (r) => broadcast('done', { kind, text: r.text, film: await film() }))
      .catch((error) => broadcast('failed', { kind, error: String(error.message || error) }))
      .finally(() => {
        job = null;
        broadcast('job', null);
      });
  };

  const handler = async (req, res, url) => {
    const p = url.pathname;
    if (p === '/' || p === '/index.html') {
      const html = await readFile(path.join(UI_DIR, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
      return true;
    }
    if (!p.startsWith('/api/')) {
      const relative = decodeURIComponent(p).replace(/^\/+/, '');
      if (!SERVED.some((s) => relative.startsWith(s))) {
        res.writeHead(403).end();
        return true;
      }
      return false; // the file server answers, with byte ranges for seeking
    }
    try {
      if (p === '/api/film' && req.method === 'GET') return json(res, 200, await film()), true;
      if (p === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write(': connected\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return true;
      }
      if (p === '/api/notes' && req.method === 'POST') {
        const b = await body(req);
        const notes = await ops.readNotes(ws);
        const time = Math.max(0, Math.min(m.duration, Number(b.time) || 0));
        const id = randomUUID().slice(0, 8);
        let frame;
        const video = typeof b.video === 'string' ? decodeURIComponent(b.video).replace(/^\/+/, '') : '';
        if (video && SERVED.some((s) => video.startsWith(s)) && existsSync(path.join(ws, video))) {
          await mkdir(path.join(notesDir, 'frames'), { recursive: true });
          const file = path.join(notesDir, 'frames', `${id}-${time.toFixed(2)}s.jpg`);
          await grabFrames(path.join(ws, video), [time], () => file);
          frame = rel(ws, file);
        }
        const note = { id, time, text: String(b.text || '').slice(0, 20000), frame, video: video || undefined, status: 'open', at: new Date().toISOString() };
        notes.push(note);
        notes.sort((a, c) => a.time - c.time);
        await saveNotes(notes);
        return json(res, 200, note), true;
      }
      const noteMatch = /^\/api\/notes\/([\w-]+)$/.exec(p);
      if (noteMatch) {
        const notes = await ops.readNotes(ws);
        const i = notes.findIndex((n) => n.id === noteMatch[1]);
        if (i < 0) return json(res, 404, { error: 'No such note' }), true;
        if (req.method === 'DELETE') notes.splice(i, 1);
        else {
          const b = await body(req);
          if (typeof b.text === 'string') notes[i].text = b.text.slice(0, 20000);
          if (b.status === 'open' || b.status === 'done') notes[i].status = b.status;
        }
        await saveNotes(notes);
        return json(res, 200, { ok: true }), true;
      }
      if (p === '/api/still' && req.method === 'POST') {
        const b = await body(req);
        const manifest = await loadManifest(ws);
        const values = resolveParams(manifest, b.params || {});
        const key = createHash('sha1').update(JSON.stringify({ t: b.time, values })).digest('hex').slice(0, 12);
        const file = path.join(ws, 'review', 'studio', `tune-${key}.jpg`);
        if (!existsSync(file)) await ops.still(ws, [Number(b.time) || 0], { params: b.params || {}, out: [file], sharp: true });
        return json(res, 200, { url: `/${rel(ws, file)}` }), true;
      }
      if (p === '/api/params' && req.method === 'POST') {
        const b = await body(req);
        const manifest = await loadManifest(ws);
        const values = resolveParams(manifest, b.values || {});
        for (const [id, value] of Object.entries(values)) manifest.params[id].value = value;
        await saveManifest(ws, manifest);
        broadcast('film', await film());
        return json(res, 200, { ok: true, params: manifest.params }), true;
      }
      if ((p === '/api/preview' || p === '/api/master') && req.method === 'POST') {
        startJob(p.slice(5));
        return json(res, 202, { started: true }), true;
      }
      return json(res, 404, { error: 'Not found' }), true;
    } catch (error) {
      return json(res, 500, { error: String(/** @type {Error} */ (error).message) }), true;
    }
  };

  let server;
  for (let port = o.port || 4700, tries = 0; ; port++, tries++) {
    try {
      server = await serve(ws, { handler, port });
      break;
    } catch (error) {
      if (tries > 20) throw error;
    }
  }
  // Tell open pages when the film's files change (a new master, new notes, edited params).
  let timer;
  for (const dir of ['out', 'review/notes']) {
    const target = path.join(ws, dir);
    if (!existsSync(target)) continue;
    watch(target, () => {
      clearTimeout(timer);
      timer = setTimeout(async () => broadcast('film', await film().catch(() => null)), 400);
    });
  }
  const url = `${server.origin}/`;
  if (o.open !== false) openBrowser(url);
  return { url, title: m.title, close: server.close };
}

/** @param {string} url */
function openBrowser(url) {
  const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url];
  spawn(command, args, { stdio: 'ignore', detached: true, windowsHide: true }).unref();
}
