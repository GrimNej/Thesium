// Python for sound: the film's kit/audio scripts (synth, audio tools, voice) run with the kit on
// PYTHONPATH. THESIUM_PYTHON picks the interpreter; otherwise Thesium's own environment,
// ~/.thesium/venv, when it exists, then the system's Python.
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from '../core/proc.js';

const WIN = process.platform === 'win32';

/** The interpreter in Thesium's own environment (python3 -m venv ~/.thesium/venv). */
export const venvPython = () => path.join(os.homedir(), '.thesium', 'venv', ...(WIN ? ['Scripts', 'python.exe'] : ['bin', 'python']));

export const python = () => process.env.THESIUM_PYTHON || (existsSync(venvPython()) ? venvPython() : WIN ? 'python' : 'python3');

// PEP 668: a system Python that refuses pip says so with this file (Arch and Omarchy, Debian,
// Ubuntu, Homebrew). A virtual environment shares the file but may install.
const MANAGED =
  "import os, sys, sysconfig; print(sys.prefix == sys.base_prefix and os.path.isfile(os.path.join(sysconfig.get_path('stdlib'), 'EXTERNALLY-MANAGED')))";

/** @type {Promise<boolean> | undefined} */
let managed;

/**
 * The command that installs packages for Thesium's Python. Where the system Python refuses pip,
 * it creates Thesium's own environment instead, which python() then uses for all sound, so it
 * starts with numpy and scipy as well.
 * @param {string} packages
 */
export async function pipInstall(packages) {
  managed ??= run(python(), ['-c', MANAGED], { timeout: 30000 }).then(
    ({ stdout }) => stdout.trim() === 'True',
    () => false,
  );
  if (!(await managed)) return `${python()} -m pip install ${packages}`;
  const all = [...new Set(['numpy', 'scipy', ...packages.split(' ')])].join(' ');
  return WIN
    ? `python -m venv %USERPROFILE%\\.thesium\\venv && %USERPROFILE%\\.thesium\\venv\\Scripts\\pip install ${all}`
    : `python3 -m venv ~/.thesium/venv && ~/.thesium/venv/bin/pip install ${all}`;
}

const HINTS = {
  numpy: ['Sound tools need numpy and scipy', 'numpy scipy'],
  scipy: ['Sound tools need numpy and scipy', 'numpy scipy'],
  kokoro_onnx: ['Narration with Kokoro needs kokoro-onnx', 'kokoro-onnx'],
  faster_whisper: ['The hearing check needs faster-whisper', 'faster-whisper'],
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
    if (missing && HINTS[missing]) throw new Error(`${HINTS[missing][0]}: ${await pipInstall(HINTS[missing][1])}`);
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
