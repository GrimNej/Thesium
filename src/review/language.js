// On-screen language check: text in a script the brief is not written in usually means
// source material leaked into the film (Chinese characters in an English promo, say).
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { stripComments } from '../engines/rules.js';

const SCRIPTS = /** @type {const} */ ([
  ['Chinese or Japanese', /[぀-ヿ㐀-䶿一-鿿]/g],
  ['Korean', /[가-힯]/g],
  ['Cyrillic', /[Ѐ-ӿ]/g],
  ['Arabic', /[؀-ۿ]/g],
  ['Devanagari', /[ऀ-ॿ]/g],
  ['Thai', /[฀-๿]/g],
  ['Hebrew', /[֐-׿]/g],
]);

/** @param {string} dir @returns {Promise<string[]>} */
async function sources(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'public' || e.name === 'vendor') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await sources(f)));
    else if (/\.(html?|m?js|jsx|tsx?|css|json)$/i.test(e.name)) out.push(f);
  }
  return out;
}

/**
 * @param {string} workspace
 * @param {import('../core/manifest.js').Manifest} m
 * @returns {Promise<import('../engines/index.js').Finding[]>}
 */
export async function scriptCheck(workspace, m) {
  const brief = await readFile(path.join(workspace, 'BRIEF.md'), 'utf8').catch(() => '');
  const request = /<request>([\s\S]*?)<\/request>/.exec(brief)?.[1] ?? brief;
  /** @type {import('../engines/index.js').Finding[]} */
  const findings = [];
  for (const file of await sources(path.join(workspace, 'film'))) {
    const text = stripComments(await readFile(file, 'utf8'));
    for (const [name, pattern] of SCRIPTS) {
      const found = [...new Set(text.match(pattern) || [])];
      if (!found.length || new RegExp(pattern.source).test(request)) continue;
      if (m.language && name === 'Chinese or Japanese' && /^(zh|ja)/.test(m.language)) continue;
      findings.push({
        level: 'warning',
        file: path.relative(workspace, file).replaceAll('\\', '/'),
        message: `${name} text (${found.slice(0, 12).join('')}) in a film whose brief is not in that script; keep on-screen text in the brief's language unless asked`,
      });
    }
  }
  return findings;
}
