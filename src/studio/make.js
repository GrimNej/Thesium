// thesium make "<brief>": one command from a request to a finished film. Creates the film
// folder, then runs a headless Claude Code director session in it with the Thesium plugin
// (the skill, the critic and the MCP server) loaded from this install, streaming its progress.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { ROOT } from '../core/paths.js';
import { createFilm } from '../core/workspace.js';
import { loadManifest } from '../core/manifest.js';
import { engine } from '../engines/index.js';

/** Tools the director may use without asking: its own film folder, the studio, research. */
const ALLOWED = ['Bash(node thesium.mjs:*)', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Agent', 'TodoWrite', 'Skill', 'mcp__plugin_thesium_thesium'];

/** @param {string} text */
const slug = (text) => text.toLowerCase().replace(/https?:\/\/\S+/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').slice(0, 5).join('-') || 'film';

/**
 * @param {string} brief
 * @param {{ folder?: string, engine?: string, width: number, height: number, duration?: number, fps?: number,
 *   title?: string, model?: string, permissionMode?: string, dryRun?: boolean, cwd?: string }} o
 * @returns {Promise<number>} exit code of the director session
 */
export async function make(brief, o) {
  if (!brief.trim()) throw new Error('Usage: thesium make "<what film you want>" [--engine effectcraft] [--duration 30] [--size 16:9]');
  const folder = path.resolve(o.cwd || process.cwd(), o.folder || slug(brief));
  const ws = await createFilm(folder, { engine: o.engine || 'web', width: o.width, height: o.height, fps: o.fps, duration: o.duration, title: o.title, brief });
  const m = await loadManifest(ws);
  await engine(m.engine).scaffold(ws, m);
  const prompt = [
    `Make this film with Thesium, following the thesium skill from start to finish: understand the commission,`,
    `gather real material, write PLAN.md, build shot by shot looking at your frames, compose the sound, check,`,
    `master, ask the critic subagent for the independent review, make one polish pass, and master again.`,
    `The film folder is the current directory, already set up for the ${m.engine} engine at ${m.width}×${m.height},`,
    `${m.fps} fps, ${m.duration} s. Use node thesium.mjs for every studio command. Work autonomously; when you finish,`,
    `reply with where the master is, the concept, and anything you could not verify.`,
    '',
    "The person's request:",
    brief,
  ].join('\n');
  const args = [
    '-p',
    prompt,
    '--plugin-dir',
    ROOT,
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    o.permissionMode || 'acceptEdits',
    '--allowedTools',
    ...ALLOWED,
    ...(o.model ? ['--model', o.model] : []),
  ];
  console.log(`Film folder: ${ws}`);
  if (o.dryRun) {
    console.log(`Would run in that folder:\nclaude ${args.map((a) => (/[\s"*()]/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
    return 0;
  }
  console.log('Director session started (Claude Code). Progress:');
  const child = spawn(process.platform === 'win32' ? 'claude.exe' : 'claude', args, { cwd: ws, stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true });
  let buffer = '';
  child.stdout.on('data', (d) => {
    buffer += d;
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!line) continue;
      try {
        report(JSON.parse(line));
      } catch {
        /* not JSON: ignore */
      }
    }
  });
  return new Promise((resolve, reject) => {
    child.on('error', (error) =>
      reject(/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT' ? new Error('Claude Code (claude) is not installed or not on PATH') : error),
    );
    child.on('close', (code) => {
      console.log(`\nFilm folder: ${ws}\nReview it with: node thesium.mjs studio (in that folder)`);
      resolve(code ?? 1);
    });
  });
}

/** One line per tool call and per message from the director. @param {any} message */
function report(message) {
  if (message.type === 'assistant')
    for (const block of message.message?.content || []) {
      if (block.type === 'tool_use') {
        const i = block.input || {};
        const what = i.command || i.file_path || i.description || i.url || i.pattern || i.prompt || '';
        console.log(`  · ${block.name}${what ? `: ${String(what).replace(/\s+/g, ' ').slice(0, 140)}` : ''}`);
      } else if (block.type === 'text' && block.text.trim()) console.log(`  ${block.text.trim().replace(/\s+/g, ' ').slice(0, 300)}`);
    }
  else if (message.type === 'result') console.log(`\n${message.result || message.subtype}`);
}
