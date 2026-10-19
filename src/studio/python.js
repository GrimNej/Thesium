// Python for sound: the film's kit/audio scripts (synth, audio tools, voice) run with the kit on
// PYTHONPATH. THESIUM_PYTHON picks the interpreter.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { run } from '../core/proc.js';

export const python = () => process.env.THESIUM_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

const HINTS = {
  numpy: 'Sound tools need numpy and scipy: {py} -m pip install numpy scipy',
  scipy: 'Sound tools need numpy and scipy: {py} -m pip install numpy scipy',
  kokoro_onnx: 'Narration with Kokoro needs kokoro-onnx: {py} -m pip install kokoro-onnx',
  faster_whisper: 'The hearing check needs faster-whisper: {py} -m pip install faster-whisper',
};

/**
 * Runs a script from the film's kit/audio and returns its combined output.
 * @param {string} ws @param {string[]} args script path first
 * @param {{ timeout?: number, signal?: AbortSignal }} [o]
 */
export async function py(ws, args, o = {}) {
  const kit = path.join(ws, 'kit', 'audio');
  if (!existsSync(path.join(kit, 'synth.py'))) throw new Error('The film has no kit/audio; run: node thesium.mjs sync');
  try {
    const { stdout, stderr } = await run(python(), args, {
      cwd: ws,
      timeout: o.timeout ?? 900000,
      signal: o.signal,
      env: { PYTHONPATH: [kit, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter), PYTHONIOENCODING: 'utf-8' },
    });
    return (stdout + stderr).trim();
  } catch (error) {
    const message = /** @type {Error} */ (error).message;
    const missing = /No module named '(\w+)/.exec(message)?.[1];
    if (missing && HINTS[missing]) throw new Error(HINTS[missing].replace('{py}', python()));
    throw error;
  }
}

/** @type {Map<string, Promise<boolean>>} */
const found = new Map();

/** Whether the interpreter can import a module (cached per process). @param {string} name */
export function hasModule(name) {
  if (!found.has(name))
    found.set(
      name,
      run(python(), ['-c', 'import importlib.util, sys; sys.exit(0 if importlib.util.find_spec(sys.argv[1]) else 1)', name], { timeout: 30000 }).then(
        () => true,
        () => false,
      ),
    );
  return /** @type {Promise<boolean>} */ (found.get(name));
}
