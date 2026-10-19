// End-to-end: a real web film through new → still → check, and the MCP handshake.
// Skips the browser parts when no Chromium-family browser is installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from '../src/browser/chrome.js';
import { main } from '../src/cli.js';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'cli', 'thesium.js');
const quiet = async (fn) => {
  const log = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
  }
};

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000}</style></head>
<body><canvas id="c"></canvas><script type="module">
import { ease, seg } from '/kit/web/motion.js';
const { width, height } = window.THESIUM; const c = document.getElementById('c'); c.width = width; c.height = height;
const g = c.getContext('2d');
window.render = (t) => { g.fillStyle = '#123'; g.fillRect(0, 0, width, height); g.fillStyle = '#6fe7f2';
  g.fillRect(40 + ease.outExpo(seg(t, 0, 1)) * (width - 120), height / 2 - 20, 40, 40); };
window.ready = true;
</script></body></html>`;

test('a web film renders stills and passes check', { skip: !(await findChrome()) && 'no Chromium-family browser' }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'thesium-test-'));
  const film = path.join(dir, 'film');
  try {
    assert.equal(await quiet(() => main(['new', film, '--engine', 'web', '--size', '640x360', '--duration', '2', '--title', 'Test'])), 0);
    await writeFile(path.join(film, 'film', 'index.html'), PAGE);
    assert.equal(await quiet(() => main(['--workspace', film, 'still', '0.5', '1.5'])), 0);
    assert.ok(existsSync(path.join(film, 'review', 'still-0.50.jpg')));
    assert.equal(await quiet(() => main(['--workspace', film, 'check'])), 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

const { findEffectCraft } = await import('../src/engines/effectcraft.js');

test('an EffectCraft film builds, renders and passes check', { skip: !(await findEffectCraft()) && 'EffectCraft not installed' }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'thesium-ec-'));
  const film = path.join(dir, 'film');
  try {
    assert.equal(await quiet(() => main(['new', film, '--engine', 'effectcraft', '--size', '640x360', '--duration', '2', '--title', 'EC test'])), 0);
    await writeFile(
      path.join(film, 'film', 'build.jsx'),
      `var comp = T.film({ background: "#05070c" });
var title = T.text("THESIUM", { font: "Unbounded", style: "Black", size: 80, fill: "#f3efe6" });
T.reveal(title, 0.2, { by: "chars", duration: 0.8 });
T.glow(title, { threshold: 60, radius: 20, intensity: 0.8 });
var ring = T.shape("ellipse", { size: [300, 300], fill: false, stroke: "#6fe7f2", strokeWidth: 3 });
T.key(ring, T.shapeItem(ring, "trim") + "/end", [[0, 0], [1.5, 100, "expo"]]);
`,
    );
    assert.equal(await quiet(() => main(['--workspace', film, 'still', '1.5'])), 0);
    assert.ok(existsSync(path.join(film, 'review', 'still-1.50.jpg')));
    assert.equal(await quiet(() => main(['--workspace', film, 'check'])), 0);
    // A font that does not exist must fail the build instead of falling back silently.
    await writeFile(path.join(film, 'film', 'build.jsx'), 'T.film(); T.text("x", { font: "No Such Family", style: "Bold" });\n');
    assert.equal(await quiet(() => main(['--workspace', film, 'build'])), 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// Remotion is installed per film, so this runs when THESIUM_TEST_REMOTION names a node_modules
// folder that has it (npm install remotion @remotion/cli react react-dom).
const REMOTION = process.env.THESIUM_TEST_REMOTION;

test('a Remotion film renders stills with params and passes check', { skip: !(REMOTION && existsSync(path.join(REMOTION, '@remotion', 'cli'))) && 'THESIUM_TEST_REMOTION not set' }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'thesium-rm-'));
  const film = path.join(dir, 'film');
  const project = path.join(film, 'film', 'remotion');
  const modules = path.join(project, 'node_modules');
  try {
    assert.equal(await quiet(() => main(['new', film, '--engine', 'remotion', '--size', '640x360', '--duration', '2', '--title', 'Remotion test'])), 0);
    await symlink(path.resolve(/** @type {string} */ (REMOTION)), modules, 'junction');
    await writeFile(
      path.join(project, 'src', 'Film.tsx'),
      `import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
export const Film = ({ thesium }: { thesium: { params?: { accent?: string } } }) => {
  const x = interpolate(useCurrentFrame(), [0, 59], [40, 560]);
  return <AbsoluteFill style={{ background: '#05070c' }}><div style={{ position: 'absolute', left: x, top: 150, width: 60, height: 60, background: thesium.params?.accent ?? '#6fe7f2' }} /></AbsoluteFill>;
};
`,
    );
    assert.equal(await quiet(() => main(['--workspace', film, 'still', '0.5', '1.5'])), 0);
    assert.ok(existsSync(path.join(film, 'review', 'still-1.50.jpg')));
    assert.equal(await quiet(() => main(['--workspace', film, 'check'])), 0);
  } finally {
    // Unlink the shared node_modules first so cleanup can never reach into it.
    await unlink(modules).catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});

test('the MCP server answers initialize and lists its tools', async () => {
  const child = spawn(process.execPath, [CLI, 'mcp'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const replies = [];
  let buffer = '';
  const done = new Promise((resolve) => {
    child.stdout.on('data', (d) => {
      buffer += d;
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        replies.push(JSON.parse(buffer.slice(0, i)));
        buffer = buffer.slice(i + 1);
        if (replies.length === 2) resolve(undefined);
      }
    });
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
  await done;
  child.stdin.end();
  assert.equal(replies[0].result.serverInfo.name, 'thesium');
  const names = replies[1].result.tools.map((t) => t.name);
  for (const name of ['new_film', 'still', 'preview', 'check', 'master', 'notes', 'guide']) assert.ok(names.includes(name), name);
});
