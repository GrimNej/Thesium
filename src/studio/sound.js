// Sound tools: scores and SFX written in code (kit/audio/synth.py), beat tracking and checks
// for sound the director cannot hear. Python with numpy and scipy runs the synthesis.
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { run } from '../core/proc.js';
import { inside, rel } from '../core/paths.js';
import { audioPictures, loudness } from '../media/audio.js';

const python = () => process.env.THESIUM_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

/** @param {string} ws @param {string[]} args */
async function py(ws, args) {
  const kit = path.join(ws, 'kit', 'audio');
  if (!existsSync(path.join(kit, 'synth.py'))) throw new Error('The film has no kit/audio; run: node thesium.mjs sync');
  try {
    const { stdout, stderr } = await run(python(), args, {
      cwd: ws,
      timeout: 900000,
      env: { PYTHONPATH: [kit, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter), PYTHONIOENCODING: 'utf-8' },
    });
    return (stdout + stderr).trim();
  } catch (error) {
    const message = /** @type {Error} */ (error).message;
    if (/No module named '(numpy|scipy)'/.test(message)) throw new Error(`Sound tools need numpy and scipy: ${python()} -m pip install numpy scipy`);
    throw error;
  }
}

/**
 * @param {string} ws
 * @param {string | undefined} action score | sfx | beats | check
 * @param {string[]} args
 * @returns {Promise<{ text: string, files: string[] }>}
 */
export async function sound(ws, action, args) {
  const kit = (f) => path.join(ws, 'kit', 'audio', f);
  switch (action) {
    case 'score': {
      if (!args[0]) throw new Error('Usage: sound score <audio/score.py>');
      const script = inside(ws, args[0]);
      return { text: await py(ws, [script]), files: [] };
    }
    case 'sfx': {
      const spec = inside(ws, args[0] || 'audio/sfx.json');
      const out = inside(ws, args[1] || 'audio/sfx.wav');
      await mkdir(path.dirname(out), { recursive: true });
      return { text: await py(ws, [kit('synth.py'), 'sfx', spec, out]), files: [out] };
    }
    case 'beats': {
      if (!args[0]) throw new Error('Usage: sound beats <audio file>');
      const out = path.join(ws, 'audio', 'beats.json');
      await mkdir(path.dirname(out), { recursive: true });
      return { text: await py(ws, [kit('audiotools.py'), 'beats', inside(ws, args[0]), out]), files: [out] };
    }
    case 'check': {
      const input = inside(ws, args[0] || 'audio/score.wav');
      const prefix = path.join(ws, 'review', path.basename(input).replace(/\.[^.]+$/, ''));
      await mkdir(path.dirname(prefix), { recursive: true });
      const measured = await loudness(input);
      const pictures = await audioPictures(input, prefix);
      let balance = '';
      try {
        balance = await py(ws, [kit('audiotools.py'), 'check', input, prefix]);
      } catch (error) {
        balance = `(balance analysis needs Python: ${/** @type {Error} */ (error).message.split('\n')[0]})`;
      }
      const report = { ...measured, input: rel(ws, input), images: [rel(ws, pictures.wave), rel(ws, pictures.spectrum)] };
      await writeFile(`${prefix}-audio.json`, JSON.stringify(report, null, 1));
      const text = [
        `${rel(ws, input)}: ${measured.integratedLufs} LUFS integrated, true peak ${measured.truePeakDbfs} dBFS, range ${measured.loudnessRangeLu} LU`,
        `Look at: ${report.images.join(', ')}`,
        'Targets: the master is normalised to -14 LUFS; aim for clear dynamics (range 4–10 LU), no clipping, low end that does not swamp the mids.',
        balance && `Balance: ${balance.split('\n').filter((l) => /lowToMid|nearSilent/.test(l)).join(' ').replace(/\s+/g, ' ')}`,
      ].filter(Boolean);
      return { text: lines(text), files: [pictures.wave, pictures.spectrum] };
    }
    default:
      throw new Error('Usage: sound score <script.py> | sound sfx [spec] [out] | sound beats <audio> | sound check <audio>');
  }
}

/** @param {string[]} parts */
const lines = (parts) => parts.join('\n');
