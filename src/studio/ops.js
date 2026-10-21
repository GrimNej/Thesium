// What Thesium can do for a film. The CLI, the MCP server and the studio UI all call these,
// so every interface behaves the same. Each returns plain data plus the files it wrote.
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { loadManifest, resolveParams, frameCount } from '../core/manifest.js';
import { inside, rel, KNOWLEDGE_DIR } from '../core/paths.js';
import { loadTimeline } from '../core/workspace.js';
import { engine, ENGINES } from '../engines/index.js';
import { renderStills, renderStrip, renderVideo, phoneCopies } from '../render/frames.js';
import { videoSheet, grabFrames, probe, imageDifference, ffmpegVersion, ff } from '../media/ffmpeg.js';
import { mixAudio, mux, loudness, blackSpans, decodedPeakDb, audioPictures, narrationBalance } from '../media/audio.js';
import { frameCheck } from '../review/framecheck.js';
import { scriptCheck } from '../review/language.js';

/** @typedef {{ text: string, files: string[], data?: any, ok?: boolean }} Result */

/**
 * Opens the film's engine, runs `fn`, and always closes it.
 * @template T
 * @param {string} workspace
 * @param {(session: import('../engines/index.js').Session, m: import('../core/manifest.js').Manifest) => Promise<T>} fn
 * @param {{ scale?: number, params?: Record<string, any>, log?: (line: string) => void, signal?: AbortSignal }} [o]
 */
export async function withSession(workspace, fn, o = {}) {
  const m = await loadManifest(workspace);
  const e = engine(m.engine);
  const session = await e.open(workspace, m, { params: resolveParams(m, o.params), scale: o.scale, log: o.log, signal: o.signal });
  try {
    return await fn(session, m);
  } finally {
    await session.close();
  }
}

const reviewDir = (ws) => path.join(ws, 'review');
const stamp = (t) => Number(t).toFixed(2);

/**
 * Full-size stills at exact times, with the master's motion blur unless `sharp`.
 * @param {string} ws
 * @param {number[]} times
 * @param {{ phone?: boolean, sharp?: boolean, params?: Record<string, any>, log?: (l: string) => void, out?: string[] }} [o]
 * @returns {Promise<Result>}
 */
export async function still(ws, times, o = {}) {
  if (!times.length) throw new Error('Give one or more times in seconds, e.g. still 0.5 2 4.25');
  const files = o.out || times.map((t) => path.join(reviewDir(ws), `still-${stamp(t)}.jpg`));
  await withSession(ws, (s, m) => renderStills(s, m, times, files, o.sharp ? { samples: 1 } : {}), o);
  const phones = o.phone ? await phoneCopies(files) : [];
  const all = [...files, ...phones];
  return { text: all.map((f) => rel(ws, f)).join('\n'), files: all };
}

/**
 * Neighbouring frames in one sheet, for fast moves and transitions.
 * @param {string} ws
 * @param {number} t
 * @param {{ count?: number, step?: number, sharp?: boolean, log?: (l: string) => void }} [o]
 * @returns {Promise<Result>}
 */
export async function strip(ws, t, o = {}) {
  const output = path.join(reviewDir(ws), `strip-${stamp(t)}.jpg`);
  await withSession(ws, (s, m) => renderStrip(s, m, t, output, { count: o.count, step: o.step, samples: o.sharp ? 1 : undefined }), o);
  return { text: rel(ws, output), files: [output] };
}

/**
 * A fast low-resolution film plus a one-per-second sheet, a phone sheet and the frame check.
 * @param {string} ws
 * @param {{ scale?: number, from?: number, to?: number, step?: number, blur?: boolean, log?: (l: string) => void,
 *   onProgress?: (done: number, total: number) => void, signal?: AbortSignal }} [o]
 * @returns {Promise<Result>}
 */
export async function preview(ws, o = {}) {
  const started = Date.now();
  const output = path.join(reviewDir(ws), 'preview.mp4');
  const m = await loadManifest(ws);
  const scale = o.scale ?? 0.5;
  await withSession(
    ws,
    (s) =>
      renderVideo(s, m, {
        output,
        from: o.from,
        to: o.to,
        draft: true,
        samples: o.blur ? m.motionBlur.samples : 1,
        scratch: path.join(ws, '.thesium', 'preview'),
        onProgress: o.onProgress,
        signal: o.signal,
      }),
    { scale, log: o.log, signal: o.signal },
  );
  const step = o.step || (m.duration > 40 ? 2 : 1);
  const from = o.from || 0;
  const sheet = await videoSheet(output, path.join(reviewDir(ws), 'preview-sheet.jpg'), { step, from: 0 });
  const phone = await videoSheet(output, path.join(reviewDir(ws), 'preview-phone.jpg'), { step: Math.max(step, 2), width: 180, columns: 8 });
  const issues = await frameCheck(output, { offset: from });
  await writeFile(path.join(reviewDir(ws), 'framecheck.json'), JSON.stringify(issues, null, 1));
  const lines = [
    `${rel(ws, output)} (${((Date.now() - started) / 1000).toFixed(1)} s to render)`,
    `${rel(ws, sheet.output)} (${sheet.frames} frames, one per ${step} s${from ? `, starting at ${from} s` : ''})`,
    `${rel(ws, phone.output)} (phone-size reading check)`,
    issues.length
      ? `Frame check (look at each; fix it or note why it is intended):\n${issues.map((f) => `  ${f.start.toFixed(1)}-${f.end.toFixed(1)} s  ${f.issue}`).join('\n')}`
      : 'Frame check: no empty bands or flat colour fields.',
  ];
  return { text: lines.join('\n'), files: [sheet.output, phone.output], data: { issues } };
}

/**
 * Compiles the source when the engine needs it (EffectCraft runs its build script).
 * @param {string} ws
 * @param {{ params?: Record<string, any>, log?: (l: string) => void }} [o]
 * @returns {Promise<Result>}
 */
export async function build(ws, o = {}) {
  const m = await loadManifest(ws);
  const e = engine(m.engine);
  if (!e.build) return { text: `${e.label} needs no build step.`, files: [] };
  const text = await e.build(ws, m, { params: resolveParams(m, o.params), log: o.log });
  return { text, files: [] };
}

/**
 * Contract checks: manifest, engine rules, sound files, on-screen language and determinism
 * (the same frames rendered in two orders must match).
 * @param {string} ws
 * @param {{ fast?: boolean, log?: (l: string) => void }} [o]
 * @returns {Promise<Result>}
 */
export async function check(ws, o = {}) {
  /** @type {import('../engines/index.js').Finding[]} */
  const findings = [];
  let m;
  try {
    m = await loadManifest(ws);
  } catch (error) {
    return { ok: false, text: `FAIL\n${/** @type {Error} */ (error).message}`, files: [] };
  }
  const e = engine(m.engine);
  findings.push(...(await e.lint(ws, m)));
  for (const key of /** @type {const} */ (['music', 'sfx', 'voice'])) {
    const file = m.audio[key];
    if (file && !existsSync(inside(ws, file))) findings.push({ level: 'error', message: `audio.${key} points to a missing file: ${file}` });
  }
  if (!m.audio.music && !m.audio.sfx && !m.audio.voice)
    findings.push({ level: 'warning', message: 'The film has no sound. Declare audio in thesium.json unless silence was asked for.' });
  const timeline = await loadTimeline(ws);
  if (timeline.sections.length < 2) findings.push({ level: 'warning', message: 'timeline.json lists fewer than two sections; name the film\'s beats so reviews and notes can refer to them' });
  for (const s of timeline.sections)
    if (s.start < 0 || s.start >= m.duration) findings.push({ level: 'warning', message: `timeline section "${s.name}" starts at ${s.start} s, outside the film` });
  findings.push(...(await scriptCheck(ws, m)));
  if (!o.fast && !findings.some((f) => f.level === 'error')) {
    const d = m.duration;
    const times = [d * 0.71, d * 0.13, d * 0.42].map((t) => Math.round(t * m.fps) / m.fps);
    const dir = path.join(ws, '.thesium', 'determinism');
    await rm(dir, { recursive: true, force: true });
    try {
      await withSession(
        ws,
        async (s) => {
          const a = times.map((t) => path.join(dir, `a-${stamp(t)}.jpg`));
          const b = [...times].reverse().map((t) => path.join(dir, `b-${stamp(t)}.jpg`));
          await renderStills(s, m, times, a, { samples: 1 });
          await renderStills(s, m, [...times].reverse(), b, { samples: 1 });
          for (let i = 0; i < times.length; i++) {
            const diff = await imageDifference(a[i], b[times.length - 1 - i]);
            if (diff > 1.5)
              findings.push({
                level: 'error',
                message: `The frame at ${times[i].toFixed(2)} s changes when frames render in another order (mean difference ${diff.toFixed(1)}): it depends on hidden state, not only on t`,
              });
          }
        },
        { log: o.log },
      );
    } catch (error) {
      findings.push({ level: 'error', message: `Rendering failed: ${String(/** @type {Error} */ (error).message).slice(0, 1500)}` });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  const ok = !findings.some((f) => f.level === 'error');
  await mkdir(reviewDir(ws), { recursive: true });
  await writeFile(path.join(reviewDir(ws), 'check.json'), JSON.stringify({ ok, at: new Date().toISOString(), findings }, null, 1));
  const lines = findings.map((f) => `${f.level.toUpperCase()}${f.file ? ` ${f.file}` : ''}: ${f.message}`);
  lines.push(ok ? 'PASS' : 'FAIL');
  return { ok, text: lines.join('\n'), files: [], data: findings };
}

/** Next version number for out/. @param {string} ws */
async function nextVersion(ws) {
  const files = await readdir(path.join(ws, 'out')).catch(() => []);
  const versions = files.map((f) => Number(/-v(\d+)\.mp4$/.exec(f)?.[1])).filter(Number.isFinite);
  return (versions.length ? Math.max(...versions) : 0) + 1;
}

const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'film';

/**
 * Renders the delivery: full-quality picture, mixed and normalised sound, technical QA,
 * contact sheets and a poster. Writes out/<title>-v<N>.mp4 and its qa json.
 * @param {string} ws
 * @param {{ draft?: boolean, log?: (l: string) => void, onProgress?: (done: number, total: number) => void, signal?: AbortSignal }} [o]
 * @returns {Promise<Result>}
 */
export async function master(ws, o = {}) {
  const started = Date.now();
  const m = await loadManifest(ws);
  const version = await nextVersion(ws);
  const name = `${slug(m.title)}-v${version}`;
  const outDir = path.join(ws, 'out');
  await mkdir(outDir, { recursive: true });
  const cache = path.join(ws, '.thesium', 'master');
  await mkdir(cache, { recursive: true });
  const picture = path.join(cache, `${name}.picture.mp4`);
  o.log?.(`rendering ${frameCount(m)} frames${m.motionBlur.samples > 1 ? ` × ${m.motionBlur.samples} motion-blur samples` : ''}`);
  await withSession(
    ws,
    (s) => renderVideo(s, m, { output: picture, draft: o.draft, scratch: cache, onProgress: o.onProgress, signal: o.signal }),
    { scale: o.draft ? 0.5 : 1, log: o.log, signal: o.signal },
  );
  const sound = await mixAudio(ws, m, path.join(cache, `${name}.wav`), { signal: o.signal });
  const output = path.join(outDir, `${name}.mp4`);
  await mux(picture, sound, output, m.duration, o.log, m.audio.truePeak);
  await rm(picture, { force: true });
  if (sound) await rm(sound, { force: true });
  const qa = await inspect(ws, m, output, path.join(outDir, `${name}-qa`), { expectSound: Boolean(sound), draft: o.draft });
  qa.renderSeconds = Math.round((Date.now() - started) / 1000);
  await writeFile(path.join(outDir, `${name}.json`), JSON.stringify({ version, title: m.title, engine: m.engine, ...qa }, null, 1));
  const lines = [
    `${rel(ws, output)} (${m.width}×${m.height}, ${m.duration} s, ${sound ? 'with sound' : 'silent'}; ${qa.renderSeconds} s)`,
    qa.issues.length ? `Technical QA found:\n${qa.issues.map((i) => `  - ${i}`).join('\n')}` : 'Technical QA: pass',
    ...(qa.narration
      ? [
          `Narration in the mix: ${[
            qa.narration.balance && `${qa.narration.balance.lu} LU above the music while it speaks (music dips ${qa.narration.balance.dip} dB${qa.narration.balance.auto ? ', auto' : ''})`,
            qa.narration.share !== undefined && `${Math.round(qa.narration.share * 100)}% of ${qa.narration.words} words heard (Whisper ${qa.narration.model})`,
          ]
            .filter(Boolean)
            .join('; ')}`,
        ]
      : []),
    `Review evidence: ${[qa.sheet, qa.phoneSheet, qa.poster].map((f) => rel(ws, f)).join(', ')}`,
  ];
  return { ok: !qa.issues.length, text: lines.join('\n'), files: [output, qa.sheet, qa.phoneSheet, qa.poster], data: { output, ...qa } };
}

/**
 * Technical checks and review images for a mastered film.
 * @param {string} ws
 * @param {import('../core/manifest.js').Manifest} m
 * @param {string} file
 * @param {string} dir
 * @param {{ expectSound: boolean, draft?: boolean }} o
 */
export async function inspect(ws, m, file, dir, o) {
  await mkdir(dir, { recursive: true });
  const info = await probe(file);
  const v = info.video;
  const issues = [];
  if (Math.abs(info.duration - m.duration) > 1.5 / m.fps) issues.push(`Duration ${info.duration.toFixed(2)} s, expected ${m.duration} s`);
  if (v.codec_name !== 'h264') issues.push(`Codec ${v.codec_name}, expected h264`);
  const [num, den] = String(v.avg_frame_rate).split('/').map(Number);
  if (Math.abs(num / (den || 1) - m.fps) > 0.01) issues.push(`Frame rate ${v.avg_frame_rate}, expected ${m.fps}`);
  if (v.pix_fmt !== 'yuv420p') issues.push(`Pixel format ${v.pix_fmt}, expected yuv420p`);
  if (!o.draft && (v.width !== m.width || v.height !== m.height)) issues.push(`Size ${v.width}×${v.height}, expected ${m.width}×${m.height}`);
  if (o.expectSound && !info.audio) issues.push('Sound was declared but the file has no audio stream');
  const black = await blackSpans(file);
  const long = black.filter((b) => b.duration > 1.2);
  if (long.length) issues.push(`Near-black spans longer than 1.2 s at ${long.map((b) => `${b.start.toFixed(1)} s`).join(', ')}`);
  let sound;
  if (info.audio) {
    sound = { ...(await loudness(file)), peakDb: await decodedPeakDb(file) };
    if (sound.peakDb !== undefined && sound.peakDb >= -0.05) issues.push(`Audio peaks at ${sound.peakDb.toFixed(2)} dBFS and clips`);
    if (sound.truePeakDbfs !== undefined && sound.truePeakDbfs > m.audio.truePeak + 0.2)
      issues.push(`True peak ${sound.truePeakDbfs} dBTP is above the ${m.audio.truePeak} dBTP target`);
    if (sound.integratedLufs !== undefined && Math.abs(sound.integratedLufs - m.audio.loudness) > 2)
      issues.push(`Loudness ${sound.integratedLufs} LUFS, target ${m.audio.loudness}`);
  }
  const narration = info.audio ? await hearNarration(ws, m, file) : undefined;
  const balance = info.audio ? await narrationBalance(ws, m, dir) : undefined;
  if (balance && balance.lu < 6)
    issues.push(
      `Narration sits only ${balance.lu} LU above the music while it speaks (aim for 8 or more): lower audio.gains.music${m.audio.duck === 'auto' ? '' : ` or set audio.duck to "auto" (now ${m.audio.duck} dB)`}`,
    );
  if (narration && narration.share < 0.85) {
    const worst = [...narration.lines].sort((a, b) => a.matched + a.near.length - (b.matched + b.near.length))[0];
    issues.push(
      `Narration is hard to make out in the mix: ${Math.round(narration.share * 100)}% of words heard (worst at ${worst.t} s: "${worst.heard}"). Raise audio.duck or lower audio.gains.music`,
    );
  }
  const sheet = (await videoSheet(file, path.join(dir, 'sheet.jpg'), { step: Math.max(0.5, m.duration / 36) })).output;
  const phoneSheet = (await videoSheet(file, path.join(dir, 'phone.jpg'), { step: Math.max(1, m.duration / 24), width: 180, columns: 8 })).output;
  const detailTimes = [0.04, 0.2, 0.4, 0.6, 0.8, 0.97].map((f) => Number(Math.min(info.duration - 0.05, m.duration * f).toFixed(2)));
  const details = await grabFrames(file, detailTimes, (t) => path.join(dir, `detail-${t.toFixed(2)}.jpg`));
  const poster = path.join(dir, 'poster.jpg');
  await grabFrames(file, [Math.min(info.duration * 0.35, 6)], () => poster);
  const issuesFound = await frameCheck(file);
  return {
    issues,
    duration: info.duration,
    width: v.width,
    height: v.height,
    sound,
    narration: narration || balance ? { ...narration, balance } : undefined,
    blackSpans: black,
    frameCheck: issuesFound,
    sheet,
    phoneSheet,
    poster,
    details: details.map((f, i) => ({ time: detailTimes[i], file: f })),
  };
}

/**
 * The hearing check on the delivered mix: the master's sound is transcribed and compared with
 * the narration script, so a voice buried under the music fails QA. Skipped without narration
 * timings or faster-whisper.
 * @param {string} ws @param {import('../core/manifest.js').Manifest} m @param {string} file
 */
async function hearNarration(ws, m, file) {
  if (!m.audio.voice || !existsSync(path.join(ws, 'kit', 'audio', 'voice.py'))) return undefined;
  const timings = inside(ws, m.audio.voice).replace(/\.wav$/i, '') + '.timeline.json';
  if (!existsSync(timings)) return undefined;
  const { hearLines } = await import('./voice.js');
  const lines = JSON.parse(await readFile(timings, 'utf8')).lines;
  return await hearLines(ws, file, lines, { language: m.language || 'en' });
}

/** Latest master in out/. @param {string} ws */
export async function latestMaster(ws) {
  const files = (await readdir(path.join(ws, 'out')).catch(() => [])).filter((f) => /-v\d+\.mp4$/.test(f));
  files.sort((a, b) => Number(/-v(\d+)\.mp4$/.exec(a)?.[1]) - Number(/-v(\d+)\.mp4$/.exec(b)?.[1]));
  const last = files.at(-1);
  return last ? path.join(ws, 'out', last) : undefined;
}

/**
 * Prepares the independent review of the latest master: evidence images, measurements,
 * the brief, the plan and every open note, gathered in review/critic/ with REVIEW.md as the
 * entry point for a reviewer who did not make the film.
 * @param {string} ws
 * @returns {Promise<Result>}
 */
export async function reviewPackage(ws) {
  const film = await latestMaster(ws);
  if (!film) throw new Error('No master yet. Run master first.');
  const m = await loadManifest(ws);
  const meta = JSON.parse(await readFile(film.replace(/\.mp4$/, '.json'), 'utf8').catch(() => '{}'));
  const qaDir = film.replace(/\.mp4$/, '-qa');
  const dir = path.join(reviewDir(ws), 'critic', path.basename(film, '.mp4'));
  await mkdir(dir, { recursive: true });
  const copy = async (from, name) => {
    if (!from || !existsSync(from)) return undefined;
    const to = path.join(dir, name);
    await copyFile(from, to);
    return to;
  };
  const sheet = await copy(path.join(qaDir, 'sheet.jpg'), 'sheet.jpg');
  const phone = await copy(path.join(qaDir, 'phone.jpg'), 'phone.jpg');
  const details = [];
  for (const d of meta.details || []) details.push(await copy(d.file, path.basename(d.file)));
  let audio;
  if (meta.sound) {
    const wav = path.join(dir, 'sound.wav');
    const { ff } = await import('../media/ffmpeg.js');
    await ff(['-i', film, '-vn', '-ac', '2', '-ar', '48000', wav]);
    audio = await audioPictures(wav, path.join(dir, 'sound'));
    await rm(wav, { force: true });
  }
  const timeline = await loadTimeline(ws);
  const notes = await openNotes(ws);
  const doc = `# Review: ${m.title} (${path.basename(film)})

You did not make this film. Judge only what the evidence shows. Read BRIEF.md (the request),
PLAN.md (what the director intended) and timeline.json (named sections), then the evidence:

- \`${rel(ws, sheet || '')}\`: one frame every ${Math.max(0.5, m.duration / 36).toFixed(2)} s across the whole film
- \`${rel(ws, phone || '')}\`: the same at phone size (360 px): can every word that matters be read?
${details.filter(Boolean).map((f) => `- \`${rel(ws, /** @type {string} */ (f))}\`: full-resolution detail`).join('\n')}
${audio ? `- \`${rel(ws, audio.wave)}\` and \`${rel(ws, audio.spectrum)}\`: the sound you cannot hear` : '- The film is silent.'}
- The film itself: \`${rel(ws, film)}\`. Render any other moment with \`node thesium.mjs still <t>\` or \`strip <t>\`.

Measurements:
- Technical QA: ${meta.issues?.length ? meta.issues.join('; ') : 'pass'}
- Sound: ${meta.sound ? `${meta.sound.integratedLufs} LUFS integrated, true peak ${meta.sound.truePeakDbfs} dBFS` : 'none'}
- Frame check (automatic; look at each): ${meta.frameCheck?.length ? meta.frameCheck.map((f) => `${f.start}-${f.end} s ${f.issue}`).join('; ') : 'nothing flagged'}

Sections: ${timeline.sections.map((s) => `${s.start}s ${s.name}`).join(' · ') || 'none named'}

${notes.length ? `The person's open notes (each must be fixed):\n${notes.map((n) => `- ${n.time.toFixed(2)} s: ${n.text}${n.frame ? ` (frame: ${n.frame})` : ''}`).join('\n')}` : 'No open notes from the person.'}

Score 0–10 from the pixels: hook, phoneLegibility, motionQuality, changeRate, composition,
transitions, sourceFidelity, audioVisualSync, originality. Then list at most eight problems,
most visible first, each with its time, the concrete problem and the smallest repair.
Write the result to \`${rel(ws, path.join(dir, 'critique.md'))}\`.
`;
  await writeFile(path.join(dir, 'REVIEW.md'), doc);
  return { text: `${rel(ws, path.join(dir, 'REVIEW.md'))}\n${doc}`, files: [sheet, phone, ...details].filter((f) => typeof f === 'string') };
}

/**
 * Extracts a video into a frame sequence for frame-accurate use (web: frames() in media.js),
 * optionally chroma-keyed to transparent PNGs.
 * @param {string} ws
 * @param {string} source workspace-relative video
 * @param {{ fps?: number, key?: string, width?: number, name?: string }} [o]
 * @returns {Promise<Result>}
 */
export async function extractFrames(ws, source, o = {}) {
  const { ff } = await import('../media/ffmpeg.js');
  const input = inside(ws, source);
  const name = o.name || path.basename(source).replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-');
  const dir = path.join(ws, 'assets', 'frames', name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const fps = o.fps || (await loadManifest(ws)).fps;
  const colour = o.key === 'green' ? '0x00FF00' : o.key === 'blue' ? '0x0000FF' : o.key?.replace('#', '0x');
  const vf = [`fps=${fps}`];
  if (o.width) vf.push(`scale=${o.width}:-2`);
  if (colour) vf.push(`chromakey=${colour}:0.16:0.08`, `despill=type=${o.key === 'blue' ? 'blue' : 'green'}`, 'format=rgba');
  const ext = colour ? 'png' : 'jpg';
  await ff(['-i', input, '-vf', vf.join(','), ...(ext === 'jpg' ? ['-q:v', '3'] : []), path.join(dir, `%05d.${ext}`)], { timeout: 900000 });
  const files = (await readdir(dir)).filter((f) => f.endsWith(`.${ext}`));
  const first = await probe(path.join(dir, files[0]));
  const meta = { source, fps, count: files.length, ext, keyed: Boolean(colour), width: first.video?.width, height: first.video?.height };
  await writeFile(path.join(dir, 'frames.json'), JSON.stringify(meta, null, 1));
  return { text: `${rel(ws, dir)}: ${meta.count} frames at ${fps} fps (${meta.width}×${meta.height}${meta.keyed ? ', keyed' : ''})`, files: [] };
}

/**
 * Notes the person pinned in the studio, oldest first.
 * @param {string} ws
 * @returns {Promise<Array<{ id: string, time: number, text: string, frame?: string, status: string, at: string }>>}
 */
export async function readNotes(ws) {
  return JSON.parse(await readFile(path.join(ws, 'review', 'notes', 'notes.json'), 'utf8').catch(() => '[]'));
}

/** @param {string} ws */
export async function openNotes(ws) {
  return (await readNotes(ws)).filter((n) => n.status !== 'done');
}

/**
 * The person's open notes, ready for the director.
 * @param {string} ws
 * @param {{ done?: string[] }} [o] mark these note ids as done
 * @returns {Promise<Result>}
 */
export async function notes(ws, o = {}) {
  const all = await readNotes(ws);
  if (o.done?.length) {
    for (const n of all) if (o.done.includes(n.id) || o.done.includes('all')) n.status = 'done';
    await writeFile(path.join(ws, 'review', 'notes', 'notes.json'), JSON.stringify(all, null, 1));
  }
  const open = all.filter((n) => n.status !== 'done');
  if (!open.length) return { text: 'No open notes.', files: [] };
  return {
    text: open.map((n) => `[${n.id}] ${n.time.toFixed(2)} s: ${n.text}${n.frame ? `\n      frame: ${n.frame}` : ''}`).join('\n'),
    files: open.flatMap((n) => (n.frame && existsSync(path.join(ws, n.frame)) ? [path.join(ws, n.frame)] : [])),
  };
}

/**
 * Where the film stands and what to do next.
 * @param {string} ws
 * @returns {Promise<Result>}
 */
export async function status(ws) {
  const m = await loadManifest(ws);
  const e = engine(m.engine);
  const has = async (p) => existsSync(path.join(ws, p));
  const plan = await readFile(path.join(ws, 'PLAN.md'), 'utf8').catch(() => '');
  const planned = plan.includes('|') && (plan.match(/\n\|/g) || []).length > 3;
  const master = await latestMaster(ws);
  const check = JSON.parse(await readFile(path.join(ws, 'review', 'check.json'), 'utf8').catch(() => 'null'));
  const open = await openNotes(ws);
  const stills = (await readdir(path.join(ws, 'review')).catch(() => [])).filter((f) => f.startsWith('still-')).length;
  const next = !planned
    ? 'Write PLAN.md (spec-grade shot list) before building.'
    : !(await has('review/preview.mp4'))
      ? 'Build shot by shot with stills, then run preview.'
      : !check?.ok
        ? 'Run check until it passes.'
        : !master
          ? 'Review the preview sheets against the rubric, ask the critic, then master.'
          : open.length
            ? `Address ${open.length} open note(s): run notes.`
            : 'Run review for the independent critique, polish once, re-master.';
  const lines = [
    `${m.title} · ${e.label} · ${m.width}×${m.height} · ${m.fps} fps · ${m.duration} s`,
    `Entry: ${m.entry} · sound: ${['music', 'sfx', 'voice'].filter((k) => m.audio[k]).join(', ') || 'none declared'} · params: ${Object.keys(m.params).length}`,
    `Plan: ${planned ? 'written' : 'not yet'} · stills: ${stills} · preview: ${(await has('review/preview.mp4')) ? 'yes' : 'no'} · check: ${check ? (check.ok ? 'pass' : 'fail') : 'not run'}`,
    `Master: ${master ? rel(ws, master) : 'none'} · open notes: ${open.length}`,
    `Engine guide: ${path.join(KNOWLEDGE_DIR, e.guide).replaceAll('\\', '/')}`,
    `Next: ${next}`,
  ];
  return { text: lines.join('\n'), files: [] };
}

/**
 * Checks the machine: Node, FFmpeg, Python for sound, and every engine.
 * @returns {Promise<Result>}
 */
export async function doctor() {
  const { run } = await import('../core/proc.js');
  const rows = [];
  rows.push(['node', true, process.version]);
  const ff = await ffmpegVersion();
  rows.push(['ffmpeg', Boolean(ff), ff || 'missing: install FFmpeg and put ffmpeg/ffprobe on PATH']);
  const { hasModule, pipInstall, python } = await import('./python.js');
  try {
    const { stdout } = await run(python(), ['-c', 'import numpy, scipy, sys; print(sys.version.split()[0], numpy.__version__, scipy.__version__)'], { timeout: 30000 });
    const [py, np, sp] = stdout.trim().split(' ');
    rows.push(['python (sound)', true, `Python ${py}, numpy ${np}, scipy ${sp}`]);
  } catch {
    rows.push(['python (sound)', false, `optional: Python 3.10+ with numpy and scipy for scores, SFX and beat tracking: ${await pipInstall('numpy scipy')}`]);
  }
  rows.push(
    (await hasModule('kokoro_onnx'))
      ? ['voice (kokoro)', true, 'Kokoro text-to-speech; the model downloads once into ~/.thesium/models']
      : ['voice (kokoro)', false, `optional: ${await pipInstall('kokoro-onnx')} for local narration`],
  );
  const { systemVoiceCheck } = await import('./voice.js');
  rows.push(['voice (system)', ...(await systemVoiceCheck())]);
  rows.push(
    (await hasModule('faster_whisper'))
      ? ['hearing (whisper)', true, 'faster-whisper transcribes narration and masters to check every word']
      : ['hearing (whisper)', false, `optional: ${await pipInstall('faster-whisper')} so narration is transcribed and checked`],
  );
  for (const e of Object.values(ENGINES)) {
    const d = await e.detect().catch((error) => ({ ok: false, detail: String(error), version: undefined, fix: undefined }));
    rows.push([`engine ${e.id}`, d.ok, `${d.version ? `${d.version} · ` : ''}${d.detail}${!d.ok && d.fix ? ` → ${d.fix}` : ''}`]);
  }
  const text = rows.map(([name, ok, detail]) => `${ok ? 'ok  ' : 'miss'}  ${String(name).padEnd(20)} ${detail}`).join('\n');
  return { ok: rows.slice(0, 2).every((r) => r[1]), text, files: [], data: rows };
}
