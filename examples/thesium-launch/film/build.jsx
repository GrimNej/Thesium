// Thesium: a 30 s launch film, built by EffectCraft from this script.
// Plan: PLAN.md. Sections: timeline.json. Persistent element: the playhead, the clock t.

var W = THESIUM.width, H = THESIUM.height, CX = W / 2, CY = H / 2;
var INK = "#05070c", BONE = "#f3efe6", STEEL = "#8a93a3", LIGHT = "#bcc4cf", WARM = "#ffb347";
var CYAN = T.params.accent || "#6fe7f2";
var DISPLAY = { font: "Unbounded", style: "Black" };
var STATEMENT = { font: "Space Grotesk", style: "Bold" };
var LINE = { font: "Space Grotesk", style: "Medium" };
var MONO = { font: "JetBrains Mono", style: "Medium" };

function opts(base, more) { var o = {}, k; for (k in base) o[k] = base[k]; for (k in more) o[k] = more[k]; return o; }
function fadeIn(layer, t0, d) { T.key(layer, "transform/opacity", [[t0, 0], [t0 + (d || 0.4), 100, "out"]]); }
function fadeOut(layer, t0, d) { T.key(layer, "transform/opacity", [[t0, 100], [t0 + (d || 0.4), 0, "in"]]); }

/** Warm sparks rising: deterministic expression particles. */
function sparks(count, seed, inT, outT, o) {
  o = o || {};
  var layers = [];
  for (var i = 0; i < count; i++) {
    var d = T.shape("ellipse", { name: "spark " + seed + "." + i, size: [10, 10], fill: i % 4 ? WARM : "#ff7a3d", in: inT, out: outT });
    var k = seed * 1000 + i;
    T.expr(d, "transform/position",
      "seedRandom(" + k + ", true); var sp = random(70, 210); var x0 = random(" + (o.x0 || 0) + ", " + (o.x1 || W) + ");" +
      "var ph = random(0, " + (H + 200) + "); var y = " + (H + 100) + " - ((time * sp + ph) % " + (H + 200) + ");" +
      "[x0 + Math.sin(time * random(0.4, 1.4) + ph) * 26, y]");
    T.expr(d, "transform/scale", "seedRandom(" + (k + 7) + ", true); var s = random(35, 150); [s, s]");
    T.expr(d, "transform/opacity", "seedRandom(" + (k + 13) + ", true); random(25, 85)");
    layers.push(d);
  }
  return layers;
}

var film = T.film({ background: INK });

// ── World: cold fractal fog, alive for the whole film ────────────────────────
var fog = T.solid(INK, { name: "Fog" });
var fn = T.fx(fog, "Fractal Noise", { fractalType: 1, contrast: 165, brightness: -30, "transform/scale": 460, complexity: 6 });
T.expr(fog, fn + "/evolution", "time * 18");
T.expr(fog, fn + "/transform/offset", "[" + CX + " + time * 14, " + CY + "]");
T.fx(fog, "Tint", { black: INK, white: "#1d4d6e" });
T.key(fog, "transform/opacity", [[0.8, 0], [2.2, 65, "inOut"], [4.0, 100, "inOut"], [20.0, 100], [20.6, 75, "out"], [25.0, 75], [26.0, 85, "inOut"]]);

// ── 0–3 Hook: a spark becomes the ruler of time ──────────────────────────────
var flare = T.solid("#000000", { name: "Spark flare", in: 0, out: 3.2 });
var lf = T.fx(flare, "Lens Flare", { flareCenter: [CX, CY], flareBrightness: 0, lensType: 1 });
T.key(flare, lf + "/flareBrightness", [[0.15, 0], [0.45, 72, "out"], [1.3, 0, "in"]]);
T.blend(flare, "Screen");

var ruler = T.shape("rect", { name: "Ruler", size: [1680, 3], fill: CYAN, in: 0, out: 3.4 });
T.key(ruler, "transform/scale", [[0.3, [0, 100, 100]], [1.3, [100, 100, 100], "expo"]]);
fadeOut(ruler, 2.5, 0.4);
T.glow(ruler, { threshold: 20, radius: 22, intensity: 1.6 });
var spark = T.shape("ellipse", { name: "Spark", size: [20, 20], fill: "#e9fdff", position: [CX, CY], in: 0, out: 3.0, blur: true });
T.key(spark, "transform/scale", [[0.15, [0, 0, 100]], [0.45, [100, 100, 100], "expo"]]);
T.key(spark, "transform/position", [[2.0, [CX, CY]], [2.45, [120, CY], "inExpo"]]);
T.key(spark, "transform/opacity", [[2.45, 100], [2.7, 0, "out"]]);
T.glow(spark, { threshold: 10, radius: 40, intensity: 2.2 });

var tickXs = [-560, -280, 0, 280, 560];
for (var ti = 0; ti < tickXs.length; ti++) {
  var tick = T.shape("rect", { name: "Tick " + ti, size: [3, 34], fill: CYAN, in: 0.4 + ti * 0.5, out: 3.4, blur: true });
  var tt = 0.5 + ti * 0.5;
  T.key(tick, "transform/position", [[tt - 0.18, [CX + tickXs[ti], CY - 90]], [tt, [CX + tickXs[ti], CY - 18], "expo"]]);
  fadeIn(tick, tt - 0.18, 0.15);
  fadeOut(tick, 2.5, 0.4);
  var mark = T.text(tt.toFixed(1) + " s", opts(MONO, { name: "Mark " + ti, size: 34, fill: STEEL, position: [CX + tickXs[ti], CY - 74], in: tt, out: 3.4 }));
  T.reveal(mark, tt, { by: "chars", duration: 0.25, from: { y: -14, opacity: 0 } });
  fadeOut(mark, 2.5, 0.4);
}

var clock = T.text("t = 0.00", opts(MONO, { name: "Clock", size: 64, fill: CYAN, position: [CX, CY + 96], in: 0, out: 3.4 }));
T.expr(clock, "text/sourceText", '"t = " + time.toFixed(2)');
fadeIn(clock, 1.15, 0.35);
fadeOut(clock, 2.5, 0.4);

// ── 3–8 Premise: Every frame is a function of time ───────────────────────────
var premiseRig = T.nul("Premise rig");
T.set(premiseRig, "transform/position", [CX, CY]);
function premiseLine(str, y, t0, color, name) {
  var l = T.text(str, opts(STATEMENT, { name: name, size: 118, fill: color, tracking: -10, position: [CX, y], in: 2.9, out: 8.2 }));
  l.parent = premiseRig;
  return l;
}
var pA = premiseLine("Every frame", 450, 3.0, STEEL, "Every frame (steel)");
var pB = premiseLine("is a function of time.", 600, 4.0, STEEL, "function (steel)");
T.reveal(pA, 3.0, { by: "words", duration: 0.55, from: { y: 70, opacity: 0, blur: 14 } });
T.reveal(pB, 4.0, { by: "words", duration: 0.75, from: { y: 70, opacity: 0, blur: 14 } });
// Bone copies revealed behind the playhead as it sweeps 5.0 → 6.5.
var bA = premiseLine("Every frame", 450, 3.0, BONE, "Every frame (bone)");
var bB = premiseLine("is a function of time.", 600, 4.0, BONE, "function (bone)");
var SWEEP_A = 5.0, SWEEP_B = 6.5, X0 = 120, X1 = W - 120;
function wipeWithPlayhead(layer, t0, t1, x0, x1, side) {
  // Linear Wipe hides `completion` % of the layer's (comp-wide) bounds: 270° from the right, 90° from the left.
  // side "left": the layer shows left of the playhead; "right": right of it.
  var right = side === "right";
  var pct = function (x) { return right ? (x / W) * 100 : 100 - (x / W) * 100; };
  var wipe = T.fx(layer, "Linear Wipe", { angle: right ? 90 : 270, feather: 6 });
  T.key(layer, wipe + "/completion", [[t0, pct(x0)], [t1, pct(x1), "inOut"]]);
}
wipeWithPlayhead(bA, SWEEP_A, SWEEP_B, X0, X1);
wipeWithPlayhead(bB, SWEEP_A, SWEEP_B, X0, X1);
T.springTo(premiseRig, "transform/scale", [104, 104, 100], [100, 100, 100], 3.0, { feel: "heavy", duration: 2.0 });
T.key(premiseRig, "transform/scale", [[7.35, [100, 100, 100]], [8.0, [22, 22, 100], "inExpo"]]);
T.key(premiseRig, "transform/opacity", [[7.6, 100], [8.0, 0, "in"]]);

// ── 8–12 Reveal: the name ────────────────────────────────────────────────────
sparks(56, 3, 7.9, 12.3);
var sparkGlow = T.adjustment("Spark glow", { in: 7.9, out: 12.3 });
T.glow(sparkGlow, { threshold: 45, radius: 28, intensity: 1.6 });
var name = T.text("THESIUM", opts(DISPLAY, { name: "THESIUM", size: 236, fill: "#dcd8cf", tracking: 60, position: [CX, CY - 40], in: 7.95, out: 12.3, blur: true }));
T.key(name, "transform/scale", [[7.95, [250, 250, 100]], [8.7, [100, 100, 100], "expo"]]);
fadeIn(name, 7.95, 0.12);
var nameGlow = T.glow(name, { threshold: 62, radius: 56, intensity: 0.75 });
// One breath of light on the downbeat after the slam.
T.key(name, nameGlow + "/intensity", [[8.95, 0.75], [9.15, 1.5, "out"], [10.2, 0.75, "inOut"]]);
// Glint: a soft white bar crossing the letters, visible only inside them (alpha track matte).
var glint = T.shape("rect", { name: "Glint", size: [150, 900], fill: "#ffffff", rotation: 18, in: 8.9, out: 10.7, blend: "Add" });
T.fx(glint, "Gaussian Blur", { blurriness: 40 });
T.key(glint, "transform/position", [[9.0, [-300, CY - 40]], [10.5, [W + 300, CY - 40], "inOut"]]);
var glintMatte = T.text("THESIUM", opts(DISPLAY, { name: "Glint matte", size: 236, fill: "#ffffff", tracking: 60, position: [CX, CY - 40], in: 8.9, out: 10.7 }));
T.key(glintMatte, "transform/scale", [[8.7, [100, 100, 100]], [12.0, [104, 104, 100], "linear"]]);
T.matte(glint, glintMatte, "alpha");

T.key(name, "transform/scale", [[8.7, [100, 100, 100]], [12.0, [104, 104, 100], "linear"]]);
var sub = T.text("a motion studio for frontier models", opts(LINE, { name: "Subline", size: 58, fill: LIGHT, position: [CX, CY + 110], in: 9.0, out: 12.3 }));
T.reveal(sub, 9.2, { by: "words", duration: 0.7, from: { y: 30, opacity: 0, blur: 8 } });

// Slam: a radial blur over everything, peaking on the cut into the name.
var slam = T.adjustment("Slam blur", { in: 7.3, out: 8.9 });
var rb = T.fx(slam, "CC Radial Fast Blur", { center: [CX, CY], amount: 0 });
T.key(slam, rb + "/amount", [[7.3, 0], [8.0, 78, "in"], [8.85, 0, "out"]]);

// ── 12–15 Sees every frame: a lit wall of real Thesium renders ───────────────
var wall = T.scene("Wall", 11.5, 3.6, function (c) {
  // No stage of its own: the film's fog world continues behind the wall.
  var frames = ["ec-title", "web-title", "ec-3d-cards", "ec-liquid", "ec-gradient", "ec-flare", "ec-impact", "ec-embers"];
  for (var i = 0; i < 15; i++) {
    var col = i % 5, row = Math.floor(i / 5);
    var src = frames[(col * 2 + row * 3) % frames.length]; // neighbours never repeat
    var card = T.image("assets/frames/" + src + ".jpg", { fit: "none", name: src + " " + i });
    T.three(card);
    T.set(card, "transform/scale", [31, 31, 31]);
    var x = (col - 2) * 640;
    T.set(card, "transform/position", [CX + x, CY + (row - 1) * 370, Math.abs(col - 2) * 240]);
    T.set(card, "transform/rotationY", (col - 2) * -16);
    T.set(card, "materialOptions/acceptsLights", true);
  }
  T.light({ kind: "Spot", color: "#ffffff", intensity: 125, position: [CX - 300, -200, -1400], poi: [CX, CY, 0], coneAngle: 110, coneFeather: 80 });
  T.light({ kind: "Ambient", intensity: 35 });
  var cam = T.camera({ preset: "35mm", position: [CX - 420, CY - 40, -1900], poi: [CX - 120, CY - 10, 0] });
  T.key(cam, "transform/position", [[0, [CX - 520, CY - 60, -2000]], [3.6, [CX + 380, CY + 20, -1650], "linear"]]);
  T.key(cam, "transform/poi", [[0, [CX - 220, CY - 20, 0]], [3.6, [CX + 200, CY, 0], "linear"]]);
  var scrim = T.solid("#000000", { name: "Scrim" });
  T.fx(scrim, "Gradient Ramp", { start: [CX, H - 380], startColor: "#000000", end: [CX, H], endColor: "#000000" });
  T.fx(scrim, "Linear Wipe", { angle: 180, completion: 58, feather: 300 });
  T.set(scrim, "transform/opacity", 93);
  var line = T.text("It sees every frame it makes.", opts(STATEMENT, { name: "Sees", size: 82, fill: BONE, tracking: -10, anchorAt: "left", position: [150, H - 150] }));
  T.reveal(line, 0.75, { by: "words", duration: 0.6, from: { y: 40, opacity: 0, blur: 10 } });
}, { motionBlur: true });
wipeWithPlayhead(wall, 11.45, 12.2, W, 0, "right");
T.key(wall, "transform/position", [[14.6, [CX, CY]], [15.05, [-CX + 40, CY], "inExpo"]]);
T.blur(wall, true);

// ── 15–17.5 Any engine ────────────────────────────────────────────────────────
var engines = T.scene("Engines", 14.6, 3.3, function () {
  var head = T.text("Any engine renders it.", opts(STATEMENT, { name: "Head", size: 76, fill: LIGHT, position: [CX, 290] }));
  T.reveal(head, 0.45, { by: "words", duration: 0.5, from: { y: 26, opacity: 0, blur: 8 } });
  T.key(head, "transform/opacity", [[2.6, 100], [2.95, 0, "in"]]);
  var names = ["WEB", "EFFECTCRAFT", "REMOTION", "HYPERFRAMES", "ANY CLI"];
  for (var i = 0; i < names.length; i++) {
    var t0 = 0.4 + i * 0.5;
    var last = i === names.length - 1;
    var w = T.text(names[i], opts(DISPLAY, { name: names[i], size: names[i].length > 8 ? 150 : 176, fill: BONE, tracking: 20, position: [CX, CY + 60], in: t0, out: last ? 3.3 : t0 + 0.5 }));
    T.key(w, "transform/scale", [[t0, [112, 112, 100]], [t0 + 0.3, [100, 100, 100], "expo"]]);
    var td = T.fx(w, "Turbulent Displace", { displacement: 3, size: 90, complexity: 2 });
    T.expr(w, td + "/evolution", "time * 160");
    if (last) T.key(w, td + "/amount", [[t0, 70], [t0 + 0.28, 0, "out"], [2.72, 0], [3.05, 240, "in"]]);
    else T.key(w, td + "/amount", [[t0, 70], [t0 + 0.28, 0, "out"]]);
    if (last) T.key(w, "transform/opacity", [[2.75, 100], [3.05, 0, "in"]]);
  }
});
T.key(engines, "transform/position", [[14.6, [W + CX - 40, CY]], [15.05, [CX, CY], "expo"]]);
T.blur(engines, true);

// ── 17.5–20 Notes on the timeline: the real studio ───────────────────────────
var notes = T.scene("Notes", 17.62, 2.75, function () {
  var shot = T.image("assets/studio.png", { fit: "none", name: "Studio" });
  T.three(shot);
  T.set(shot, "transform/scale", [112, 112, 112]);
  T.set(shot, "transform/rotationX", 14);
  T.set(shot, "transform/rotationY", -16);
  T.set(shot, "transform/position", [CX + 120, CY + 40, 0]);
  T.set(shot, "materialOptions/acceptsLights", false);
  var pin = T.shape("ellipse", { name: "Pin", size: [30, 30], fill: "#f3c969", parent: shot, threeD: true });
  // In the screenshot's own pixels: the timeline track runs x 20–1045 at y = 755.
  T.key(pin, "transform/position", [[0.9, [640, 600, -40]], [1.3, [640, 755, -4], "expo"]]);
  T.key(pin, "transform/opacity", [[0.9, 0], [1.0, 100, "out"]]);
  var ring = T.shape("ellipse", { name: "Pin ring", size: [30, 30], fill: false, stroke: "#f3c969", strokeWidth: 4, parent: shot, threeD: true, position: [640, 755, -4] });
  T.key(ring, "transform/scale", [[1.3, [100, 100, 100]], [1.9, [380, 380, 100], "out"]]);
  T.key(ring, "transform/opacity", [[1.3, 90], [1.9, 0, "out"]]);
  var cam = T.camera({ preset: "35mm", position: [CX, CY, -2300], poi: [CX + 60, CY + 20, 0] });
  T.key(cam, "transform/position", [[0, [CX - 60, CY - 30, -2050]], [2.75, [CX + 60, CY + 20, -1700], "out"]]);
  var scrim = T.solid("#000000", { name: "Scrim" });
  T.fx(scrim, "Linear Wipe", { angle: 0, completion: 70, feather: 280 });
  T.set(scrim, "transform/opacity", 75);
  var line = T.text("Notes land on the timeline.", opts(STATEMENT, { name: "Notes", size: 78, fill: BONE, tracking: -10, anchorAt: "left", position: [150, 150] }));
  T.reveal(line, 0.35, { by: "words", duration: 0.6, from: { y: 36, opacity: 0, blur: 10 } });
});
T.key(notes, "transform/opacity", [[17.62, 0], [17.9, 100, "out"], [19.8, 100], [19.96, 0, "in"]]);
T.key(notes, "transform/scale", [[17.62, [92, 92, 100]], [18.2, [100, 100, 100], "expo"]]);

// ── 20–25 Same film ──────────────────────────────────────────────────────────
var same = T.text("SAME FILM.", opts(DISPLAY, { name: "SAME FILM", size: 210, fill: BONE, tracking: 30, position: [CX, CY - 50], in: 19.95, out: 25.3, blur: true }));
T.key(same, "transform/scale", [[19.95, [175, 175, 100]], [20.5, [100, 100, 100], "expo"]]);
T.key(same, "transform/opacity", [[19.95, 0], [20.03, 100, "out"]]);
var sameSub = T.text("The model directs. Any engine renders.", opts(LINE, { name: "Directs", size: 60, fill: LIGHT, position: [CX, CY + 110], in: 20.6, out: 25.3 }));
T.reveal(sameSub, 20.8, { by: "words", duration: 0.7, from: { y: 26, opacity: 0, blur: 8 } });
var HANDOFF_A = 24.6, HANDOFF_B = 25.25;
wipeWithPlayhead(same, HANDOFF_A, HANDOFF_B, W, 0, "left");
wipeWithPlayhead(sameSub, HANDOFF_A, HANDOFF_B, W, 0, "left");

// ── 25–30 End ────────────────────────────────────────────────────────────────
var endName = T.text("THESIUM", opts(DISPLAY, { name: "End name", size: 150, fill: BONE, tracking: 60, position: [CX, 400], in: HANDOFF_A }));
wipeWithPlayhead(endName, HANDOFF_A, HANDOFF_B, W, 0, "right");
T.glow(endName, { threshold: 62, radius: 44, intensity: 0.6 });
var tag = T.text("Any engine. Same film.", opts(LINE, { name: "Tagline", size: 60, fill: BONE, position: [CX, 545], in: HANDOFF_A }));
wipeWithPlayhead(tag, HANDOFF_A, HANDOFF_B, W, 0, "right");
var url = T.text("github.com/GrimNej/Thesium", opts(MONO, { name: "URL", size: 50, fill: CYAN, position: [CX, 690], in: HANDOFF_A }));
wipeWithPlayhead(url, HANDOFF_A, HANDOFF_B, W, 0, "right");
var urlBox = url.sourceRectAtTime(26, false);
var endRig = T.nul("End rig");
T.set(endRig, "transform/position", [CX, CY]);
endName.parent = endRig; tag.parent = endRig; // the address stays put: the playhead underlines it
T.key(endRig, "transform/scale", [[25.0, [100, 100, 100]], [30.0, [103, 103, 100], "linear"]]);

// ── The playhead: one line, the whole film ───────────────────────────────────
// Crisp, no motion blur: the playhead is the film's instrument and must read even mid-sweep.
var head = T.shape("rect", { name: "Playhead", size: [4, H], fill: CYAN, in: 2.4 });
T.glow(head, { threshold: 10, radius: 22, intensity: 1.6 });
// Born from the ruler's left end, then sweeps, hides, wipes, sweeps three times, lies down.
T.key(head, "transform/position", [
  [2.4, [X0, CY]], [SWEEP_A, [X0, CY]], [SWEEP_B, [X1, CY], "inOut"], [7.3, [X1, CY]], [7.9, [CX, CY], "inExpo"],
  [11.45, [W, CY], "hold"], [12.2, [0, CY], "inOut"],
  [20.4, [-10, CY], "hold"], [21.5, [W + 10, CY], "inOut"],
  [21.9, [-10, CY], "hold"], [23.0, [W + 10, CY], "inOut"],
  [23.4, [-10, CY], "hold"], [24.5, [W + 10, CY], "inOut"],
  [HANDOFF_A, [W, CY], "linear"], [HANDOFF_B, [0, CY], "inOut"],
  [25.6, [CX, 750], "hold"]
]);
T.key(head, "transform/scale", [[2.4, [100, 0, 100]], [3.0, [100, 100, 100], "expo"], [25.6, [100, (urlBox.width + 40) / H * 100, 100], "hold"]]);
T.key(head, "transform/rotation", [[0, 0], [25.6, 90, "hold"]]);
T.key(head, "transform/opacity", [
  [2.4, 0], [2.5, 100, "out"], [7.6, 100], [7.9, 0, "in"],
  [11.4, 0, "hold"], [11.45, 100, "hold"], [12.2, 100], [12.35, 0, "in"],
  [20.35, 0, "hold"], [20.4, 100, "hold"], [HANDOFF_B, 100], [HANDOFF_B + 0.1, 0, "in"],
  [25.6, 0, "hold"], [25.62, 100, "hold"]
]);
// The line draws itself under the address.
var draw = T.fx(head, "Linear Wipe", { angle: 180, feather: 4 });
T.key(head, draw + "/completion", [[0, 0], [25.6, 100, "hold"], [26.3, 0, "expo"]]);

// The readout rides the playhead: real time, and the engine at each pass of "Same film".
var readout = T.text("t = 0.00", opts(MONO, { name: "Readout", size: 40, fill: INK, position: [0, 0], in: 4.9, out: 25.4 }));
T.expr(readout, "text/sourceText",
  'var e = time < 20 ? "" : time < 21.7 ? "  ·  web" : time < 23.2 ? "  ·  effectcraft" : time < 24.55 ? "  ·  remotion" : ""; "t = " + time.toFixed(2) + e');
var pill = T.shape("rounded", { name: "Readout pill", size: [10, 46], fill: CYAN, in: 4.9, out: 25.4 });
T.expr(pill, "contents/group/contents/rect/size", 'var r = thisComp.layer("Readout").sourceRectAtTime(time, false); [r.width + 44, 64]');
T.expr(pill, "transform/position", 'var p = thisComp.layer("Playhead").transform.position; [p[0] + (p[0] > ' + (W - 320) + ' ? -1 : 1) * (thisComp.layer("Readout").sourceRectAtTime(time, false).width / 2 + 34), 96]');
T.expr(readout, "transform/position", 'thisComp.layer("Readout pill").transform.position');
T.expr(pill, "transform/opacity", 'thisComp.layer("Playhead").transform.opacity');
T.expr(readout, "transform/opacity", 'thisComp.layer("Playhead").transform.opacity');
// Above the pill in the stack.
readout.moveBefore(pill);

// ── Finish: vignette and fine grain over everything ──────────────────────────
var finish = T.adjustment("Finish");
T.fx(finish, "CC Vignette", { amount: 55 });
T.fx(finish, "Add Grain", { preset: 1, "tweaking/intensity": 0.35 });
