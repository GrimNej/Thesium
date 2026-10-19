// Source rules shared by every engine's lint: comment stripping and pattern scanning.

/** @typedef {import('./index.js').Finding} Finding */

/** Strips JS/CSS comments so rules only see code. @param {string} text */
export function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
}

/**
 * Applies regex rules to source text.
 * @param {string} text
 * @param {string} file
 * @param {Array<{ pattern: RegExp, level: Finding['level'], message: string }>} rules
 * @returns {Finding[]}
 */
export function scan(text, file, rules) {
  const code = stripComments(text);
  return rules.filter((r) => r.pattern.test(code)).map((r) => ({ level: r.level, message: r.message, file }));
}
