// Where things live: the Thesium install, and the parts of a film workspace.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The Thesium install (the folder holding bin/, src/, kit/, knowledge/). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const KIT_DIR = path.join(ROOT, 'kit');
export const KNOWLEDGE_DIR = path.join(ROOT, 'knowledge');
export const FONT_DIR = path.join(ROOT, 'fonts');
export const UI_DIR = path.join(ROOT, 'src', 'studio', 'ui');

/** Folders of a film workspace and what they hold. */
export const LAYOUT = {
  film: 'film', // the engine source the director writes
  assets: 'assets', // media: supplied, captured, made
  audio: 'audio', // score, SFX, voice and their stems
  review: 'review', // stills, strips, sheets, previews, checks, notes, critiques
  out: 'out', // masters and their QA
  kit: 'kit', // Thesium's in-film helpers, refreshed by `thesium sync`
  cache: '.thesium', // build products and temporary frames
};

/**
 * Resolves a workspace-relative path and refuses anything that leaves the workspace.
 * @param {string} workspace
 * @param {string} relative
 */
export function inside(workspace, relative) {
  const root = path.resolve(workspace);
  const file = path.resolve(root, relative);
  const rel = path.relative(root, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Path leaves the film folder: ${relative}`);
  return file;
}

/** A workspace path shown to people and models: relative, forward slashes. */
export function rel(workspace, file) {
  return path.relative(workspace, file).replaceAll('\\', '/');
}
