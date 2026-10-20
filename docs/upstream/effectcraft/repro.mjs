// Reproduces the EffectCraft issues in ISSUES.md with plain EffectCraft scripts (no Thesium kit):
// builds a small project per case with `effectcraft-cli script`, renders frames with
// `effectcraft-cli run … comp.saveFrameAs`, and measures them with FFmpeg.
// Run from the repository: node docs/upstream/effectcraft/repro.mjs   (needs EffectCraft and FFmpeg)
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findEffectCraft } from '../../../src/engines/effectcraft.js';
import { run } from '../../../src/core/proc.js';
import { FONT_DIR } from '../../../src/core/paths.js';

const cli = await findEffectCraft();
if (!cli) throw new Error('EffectCraft not found');
const { stdout: version } = await run(cli, ['--version']).catch(() => ({ stdout: '?' }));
const dir = await mkdtemp(path.join(os.tmpdir(), 'ec-repro-'));
const posix = (p) => p.replaceAll('\\', '/');

const HELPERS = `
function byId(comp, id) { for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).id === id) return comp.layer(i); }
function make(name, w, h, dur) { var c = app.project.items.addComp(name, w, h, 1, dur, 30); c.bgColor = [0, 0, 0]; app.run("comp.open", { comp: c.id }); return c; }
function text(c, s, font, style) { var r = app.run("layer.newText", { text: s, name: "t", font: font, style: style, size: 150, fill: "#ffffff", justify: "center" }); var l = byId(c, r.layer); app.run("prop.set", { layer: l.id, path: "transform/position", value: [600, 250] }); return l; }
function solid(c, color) { return byId(c, app.run("layer.newSolid", { color: color, name: "Solid", width: c.width, height: c.height }).layer); }
`;

/** Builds a project from script `body`, renders [comp, time] frames, returns their paths. */
async function build(name, body, frames, env = {}) {
  const script = path.join(dir, `${name}.jsx`);
  const project = path.join(dir, `${name}.ecproj`);
  await writeFile(script, HELPERS + body);
  await run(cli, ['script', posix(script), '--empty', '--save-as', posix(project)], { env, timeout: 300000 });
  const files = frames.map(([comp, t]) => path.join(dir, `${name}-${comp.replace(/\W+/g, '_')}-${t}.png`));
  const args = [posix(project)];
  frames.forEach(([comp, t], i) => args.push('comp.open', JSON.stringify({ comp }), 'comp.saveFrameAs', JSON.stringify({ path: posix(files[i]), time: t })));
  await run(cli, ['run', ...args, '--json'], { env, timeout: 300000 });
  return files;
}

/** Mean luma (0–255) of an image, or of the difference between two. */
async function luma(a, b) {
  const graph = b ? ['-i', a, '-i', b, '-filter_complex', '[0][1]blend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG'] : ['-i', a, '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG'];
  const { stderr, stdout } = await run('ffmpeg', ['-hide_banner', ...graph, '-f', 'null', '-']);
  return Number(/YAVG=([\d.]+)/.exec(stderr + stdout)?.[1] ?? NaN);
}

const results = [];
const report = (id, title, reproduced, detail) => {
  results.push({ id, title, reproduced, detail });
  console.log(`${reproduced ? 'REPRODUCED' : 'not seen  '}  ${id}  ${title}\n            ${detail}`);
};

// 1. Variable fonts: does the style pick the weight? Only the variable file is visible here
// (Thesium's fonts/ also holds static instances in fonts/static, which EffectCraft may find).
const variableOnly = path.join(dir, 'variable-fonts');
await mkdir(variableOnly, { recursive: true });
await copyFile(path.join(FONT_DIR, 'Unbounded.ttf'), path.join(variableOnly, 'Unbounded.ttf'));
{
  const [black, light] = await build(
    'variable-font',
    `["Black", "Light"].forEach(function (s) { var c = make("Weight " + s, 1200, 400, 1); text(c, "Weight", "Unbounded", s); });`,
    [['Weight Black', 0], ['Weight Light', 0]],
    { EFFECTCRAFT_FONT_DIRS: variableOnly },
  );
  const [b, l, d] = [await luma(black), await luma(light), await luma(black, light)];
  report('1', 'Variable font: style "Black" and "Light" render identically', d < 0.5, `mean luma Black ${b.toFixed(2)}, Light ${l.toFixed(2)}, difference ${d.toFixed(3)} (fonts/Unbounded.ttf is a variable font, wght 200–900)`);
}

// 2. A font name that does not resolve: is it reported, or replaced by Inter silently?
{
  const [missing, inter] = await build(
    'missing-font',
    `var a = make("Missing", 1200, 400, 1); text(a, "Weight", "No Such Family", "Bold");
     var b = make("Inter", 1200, 400, 1); text(b, "Weight", "Inter", "Bold");`,
    [['Missing', 0], ['Inter', 0]],
  );
  const d = await luma(missing, inter);
  report('2b', 'A missing font family renders in Inter with no error', d < 0.5, `"No Such Family" against "Inter": difference ${d.toFixed(3)}; the script and the render succeed without a warning`);
}
// 2a. A PostScript name, with only static instances visible.
{
  const [ps, inter] = await build(
    'postscript-name',
    `var a = make("PostScript name", 1200, 400, 1); text(a, "Weight", "Unbounded-Black", "Regular");
     var b = make("Inter", 1200, 400, 1); text(b, "Weight", "Inter", "Regular");`,
    [['PostScript name', 0], ['Inter', 0]],
    { EFFECTCRAFT_FONT_DIRS: [path.join(FONT_DIR, 'static'), FONT_DIR].join(path.delimiter) },
  );
  const d = await luma(ps, inter);
  report('2a', 'A PostScript name (Unbounded-Black) falls back to Inter', d < 0.5, `"Unbounded-Black" against "Inter": difference ${d.toFixed(3)}`);
}

// 3–5. Effects that render nothing on a fresh layer with their defaults.
for (const [id, effect, source] of [
  ['3', 'CC Particle World', '"#000000"'],
  ['4', 'CC Star Burst', '"#ffffff"'],
]) {
  const name = effect.replace(/\W+/g, '-').toLowerCase();
  const files = await build(name, `var c = make("Comp", 640, 360, 4); var l = solid(c, ${source}); app.run("effect.apply", { effect: "${effect}", layers: [l.id] });`, [['Comp', 1], ['Comp', 2], ['Comp', 3]]);
  const values = await Promise.all(files.map((f) => luma(f)));
  report(id, `${effect} renders nothing with its defaults`, values.every((v) => v < 0.5), `mean luma at 1, 2, 3 s: ${values.map((v) => v.toFixed(2)).join(', ')} (a ${source === '"#000000"' ? 'black' : 'white'} solid source)`);
}
{
  const [plain, rays] = await build(
    'cc-light-rays',
    `["Plain", "Rays"].forEach(function (n) { var c = make(n, 640, 360, 1); var r = app.run("layer.newShape", { kind: "ellipse", name: "Dot", size: [120, 120], fill: "#ffffff" }); var l = byId(c, r.layer); app.run("prop.set", { layer: l.id, path: "transform/position", value: [320, 180] }); if (n === "Rays") app.run("effect.apply", { effect: "CC Light Rays", layers: [l.id] }); });`,
    [['Plain', 0.5], ['Rays', 0.5]],
  );
  const [a, b] = [await luma(plain), await luma(rays)];
  report('5', 'CC Light Rays: no rays (invisible or blown out)', Math.abs(a - b) < 0.5 || b > 200, `mean luma without ${a.toFixed(2)}, with CC Light Rays ${b.toFixed(2)} (a white 120 px dot on black)`);
}

// 6. Echo on a shape layer leaves no trail; on a precomposed layer it does.
{
  const files = await build(
    'echo-shape',
    `function mover(c) { var r = app.run("layer.newShape", { kind: "rect", name: "Box", size: [80, 80], fill: "#ffffff" }); var l = byId(c, r.layer);
       app.run("prop.addKey", { layer: l.id, path: "transform/position", time: 0, timeBase: "comp", value: [100, 180] });
       app.run("prop.addKey", { layer: l.id, path: "transform/position", time: 1, timeBase: "comp", value: [540, 180] }); return l; }
     function echo(l) { var r = app.run("effect.apply", { effect: "Echo", layers: [l.id] }); var p = r.paths ? r.paths[0] : "effects/#1";
       app.run("prop.set", { layer: l.id, path: p + "/numberOfEchoes", value: 6 }); app.run("prop.set", { layer: l.id, path: p + "/echoTime", value: -0.05 }); }
     var a = make("Shape plain", 640, 360, 1); mover(a);
     var b = make("Shape echo", 640, 360, 1); echo(mover(b));
     var inner = make("Inner", 640, 360, 1); mover(inner);
     var c = make("Precomp echo", 640, 360, 1); var pl = c.layers.add(inner); echo(pl);
     var d = make("Precomp plain", 640, 360, 1); d.layers.add(inner);`,
    [['Shape plain', 0.5], ['Shape echo', 0.5], ['Precomp plain', 0.5], ['Precomp echo', 0.5]],
  );
  const shape = await luma(files[0], files[1]);
  const pre = await luma(files[2], files[3]);
  report('6', 'Echo on a shape layer leaves no trail', shape < 0.5 && pre > 0.5, `difference with/without Echo: shape layer ${shape.toFixed(3)}, same box precomposed ${pre.toFixed(3)}`);
}

console.log(`\nEffectCraft ${String(version).trim()} · ${os.platform()} ${os.release()} · work files in ${dir}`);
await writeFile(path.join(path.dirname(fileURLToPath(import.meta.url)), 'results.json'), JSON.stringify({ effectcraft: String(version).trim(), platform: `${os.platform()} ${os.release()}`, date: new Date().toISOString().slice(0, 10), results }, null, 1));
