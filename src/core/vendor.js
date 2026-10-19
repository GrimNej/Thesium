// Optional browser libraries for web films (Three.js, GSAP, p5). Each version is fetched once
// from the npm registry into ~/.thesium/vendor and served locally, so renders stay offline.
import { mkdir, readdir, rm, stat, writeFile, rename } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

export const VENDOR_HOME = process.env.THESIUM_VENDOR || path.join(os.homedir(), '.thesium', 'vendor');

/** What each known library exposes to film pages. */
export const LIBRARIES = {
  three: {
    note: 'import * as THREE from "three"; addons from "three/addons/…"',
    importMap: { three: 'build/three.module.js', 'three/addons/': 'examples/jsm/', 'three/examples/jsm/': 'examples/jsm/' },
  },
  gsap: {
    note: 'import { gsap } from "gsap"; drive a paused timeline with tl.seek(t) inside render(t)',
    importMap: { gsap: 'index.js', 'gsap/': '' },
  },
  p5: {
    note: '<script src="/vendor/p5/lib/p5.min.js">; noLoop() and redraw() inside render(t)',
    importMap: {},
  },
};

/** @param {string} name @param {string} version */
export const vendorDir = (name, version) => path.join(VENDOR_HOME, `${name.replace('/', '+')}@${version}`);

/** Minimal ustar/pax reader for npm tarballs. @param {Buffer} tar @param {string} target */
async function untar(tar, target) {
  let offset = 0;
  let longName = '';
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const field = (start, length) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
    const size = parseInt(field(124, 12).trim() || '0', 8);
    const type = field(156, 1);
    const prefix = field(345, 155);
    let name = longName || (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
    longName = '';
    const body = tar.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') {
      const match = /\d+ path=([^\n]+)\n/.exec(body.toString('utf8'));
      if (match) longName = match[1];
      continue;
    }
    if (type === 'L') {
      longName = body.toString('utf8').replace(/\0.*$/s, '');
      continue;
    }
    if (type !== '0' && type !== '' && type !== '\0') continue;
    name = name.replace(/^[^/]+\//, ''); // npm tarballs wrap everything in package/
    const file = path.resolve(target, name);
    if (!file.startsWith(path.resolve(target) + path.sep)) continue;
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }
}

/**
 * Makes `name@version` available locally (downloading it the first time).
 * @param {string} name
 * @param {string} [version] exact version or "latest"
 * @returns {Promise<{ name: string, version: string, dir: string, downloaded: boolean }>}
 */
export async function ensurePackage(name, version = 'latest') {
  if (version !== 'latest') {
    const dir = vendorDir(name, version);
    if (await stat(dir).catch(() => undefined)) return { name, version, dir, downloaded: false };
  }
  const meta = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2F')}`).then((r) => {
    if (!r.ok) throw new Error(`npm registry: ${name} → HTTP ${r.status}`);
    return r.json();
  });
  const resolved = version === 'latest' ? meta['dist-tags']?.latest : version;
  const info = meta.versions?.[resolved];
  if (!info) throw new Error(`${name}@${version} is not on the npm registry`);
  const dir = vendorDir(name, resolved);
  if (await stat(dir).catch(() => undefined)) return { name, version: resolved, dir, downloaded: false };
  const tgz = Buffer.from(await (await fetch(info.dist.tarball)).arrayBuffer());
  const staging = `${dir}.partial`;
  await rm(staging, { recursive: true, force: true });
  await untar(gunzipSync(tgz), staging);
  await rename(staging, dir);
  return { name, version: resolved, dir, downloaded: true };
}

/** Versions present in the local cache. */
export async function cachedPackages() {
  const entries = await readdir(VENDOR_HOME).catch(() => []);
  return entries.filter((e) => e.includes('@') && !e.endsWith('.partial'));
}

/**
 * Mounts and import map for the libraries a film pins in thesium.json → engineOptions.web.vendor.
 * @param {Record<string, string>} pinned e.g. { three: "0.180.0" }
 */
export function vendorSetup(pinned = {}) {
  /** @type {Record<string, string>} */
  const mounts = {};
  /** @type {Record<string, string>} */
  const imports = {};
  for (const [name, version] of Object.entries(pinned)) {
    const base = `/vendor/${name}`;
    mounts[base] = vendorDir(name, version);
    const lib = LIBRARIES[/** @type {keyof typeof LIBRARIES} */ (name)];
    for (const [specifier, target] of Object.entries(lib?.importMap || {})) imports[specifier] = `${base}/${target}`;
  }
  return { mounts, imports };
}
