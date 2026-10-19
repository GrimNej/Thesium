// A loopback file server for film pages: the workspace at /, read-only mounts such as
// /thesium/fonts, and a script injected into every HTML page's <head>.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.hdr': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/**
 * @typedef {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, url: URL)
 *   => Promise<boolean> | boolean} Handler  returns true when it answered the request
 */

/**
 * Serves files under `root` (and `mounts`) on 127.0.0.1. Paths never escape their base.
 * @param {string} root
 * @param {{ mounts?: Record<string, string>, inject?: string | (() => string), handler?: Handler, port?: number }} [o]
 */
export async function serve(root, o = {}) {
  const mounts = o.mounts || {};
  const prefixes = Object.keys(mounts).sort((a, b) => b.length - a.length);
  const resolve = (pathname) => {
    const clean = decodeURIComponent(pathname);
    const mount = prefixes.find((p) => clean === p || clean.startsWith(p + '/'));
    const base = path.resolve(mount ? mounts[mount] : root);
    const relative = mount ? clean.slice(mount.length) : clean;
    const file = path.resolve(base, '.' + (relative || '/'));
    const r = path.relative(base, file);
    if (r.startsWith('..') || path.isAbsolute(r)) return undefined;
    return file;
  };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (o.handler && (await o.handler(req, res, url))) return;
      let file = resolve(url.pathname);
      if (!file) return void res.writeHead(403).end();
      let info = await stat(file).catch(() => undefined);
      if (info?.isDirectory()) {
        file = path.join(file, 'index.html');
        info = await stat(file).catch(() => undefined);
      }
      if (!info?.isFile()) return void res.writeHead(404).end();
      const ext = path.extname(file).toLowerCase();
      const headers = {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
      };
      const inject = typeof o.inject === 'function' ? o.inject() : o.inject;
      if (inject && ext === '.html') {
        let html = await readFile(file, 'utf8');
        html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (tag) => tag + inject) : inject + html;
        const body = Buffer.from(html);
        res.writeHead(200, { ...headers, 'Content-Length': String(body.length) });
        return void res.end(req.method === 'HEAD' ? undefined : body);
      }
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (range && (range[1] || range[2])) {
        const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
        res.writeHead(206, {
          ...headers,
          'Content-Range': `bytes ${start}-${end}/${info.size}`,
          'Content-Length': String(end - start + 1),
        });
        return void createReadStream(file, { start, end }).pipe(res);
      }
      res.writeHead(200, { ...headers, 'Content-Length': String(info.size) });
      if (req.method === 'HEAD') res.end();
      else createReadStream(file).pipe(res);
    } catch (error) {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(String(error));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(o.port || 0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(undefined);
    });
  });
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    origin: `http://127.0.0.1:${address.port}`,
    port: address.port,
    server,
    close: () => new Promise((resolve) => server.close(() => resolve(undefined))),
  };
}
