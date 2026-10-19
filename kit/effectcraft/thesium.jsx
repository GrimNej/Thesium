// Thesium kit for EffectCraft films. Included before film/build.jsx on every build.
//
// THESIUM   the film's facts from thesium.json: width, height, fps, duration, params, root
// T         helpers: the same craft vocabulary as the web kit (eases, springs, seeded noise),
//           plus layers, keyframes, effects, text reveals, cameras and scenes for EffectCraft.
//
// Everything is ordinary EffectCraft scripting underneath (app.run(commandId, params) and the
// After Effects object model), so anything T does not cover can be done directly.
// Times are comp seconds unless a name says otherwise. Colors are "#rrggbb" or [r, g, b] in 0..1.

var T = (function () {
  var F = THESIUM;

  // ── Math: identical to the web kit's motion.js ───────────────────────────
  function clamp(x, a, b) { a = a === undefined ? 0 : a; b = b === undefined ? 1 : b; return Math.max(a, Math.min(b, x)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function seg(t, a, b) { return clamp((t - a) / (b - a)); }
  function env(t, a, b, fadeIn, fadeOut) {
    fadeIn = fadeIn === undefined ? 0.3 : fadeIn; fadeOut = fadeOut === undefined ? 0.3 : fadeOut;
    return Math.min(seg(t, a, a + fadeIn), 1 - seg(t, b - fadeOut, b));
  }
  function bezier(x1, y1, x2, y2) {
    return function (x) {
      var s = x;
      for (var i = 0; i < 6; i++) {
        var cx = 3 * x1 * s * (1 - s) * (1 - s) + 3 * x2 * s * s * (1 - s) + s * s * s - x;
        var dx = 3 * x1 * (1 - s) * (1 - s) + 6 * (x2 - x1) * s * (1 - s) + 3 * (1 - x2) * s * s;
        if (Math.abs(dx) < 1e-6) break;
        s = clamp(s - cx / dx);
      }
      return 3 * y1 * s * (1 - s) * (1 - s) + 3 * y2 * s * s * (1 - s) + s * s * s;
    };
  }
  var ease = {
    linear: function (t) { return clamp(t); },
    "in": function (t) { t = clamp(t); return t * t * t; },
    out: function (t) { t = clamp(t); return 1 - Math.pow(1 - t, 3); },
    inOut: function (t) { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    outQuart: function (t) { return 1 - Math.pow(1 - clamp(t), 4); },
    outQuint: function (t) { return 1 - Math.pow(1 - clamp(t), 5); },
    outExpo: function (t) { t = clamp(t); return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); },
    inOutExpo: function (t) {
      t = clamp(t); if (t === 0 || t === 1) return t;
      return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
    },
    outBack: function (t, s) { s = s === undefined ? 1.70158 : s; t = clamp(t) - 1; return 1 + t * t * ((s + 1) * t + s); },
    smooth: function (t) { t = clamp(t); return t * t * (3 - 2 * t); },
    smoother: function (t) { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); },
    snap: bezier(0.7, 0, 0.2, 1),
    emphasized: bezier(0.05, 0.7, 0.1, 1),
    bezier: bezier
  };
  /** Closed-form spring 0→1; x = seconds since the target changed. w stiffness, z damping ratio. */
  function spring(x, w, z) {
    w = w === undefined ? 16 : w; z = z === undefined ? 0.72 : z;
    if (x <= 0) return 0;
    if (z >= 1) return 1 - Math.exp(-w * x) * (1 + w * x);
    var wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * x) * (Math.cos(wd * x) + ((z * w) / wd) * Math.sin(wd * x));
  }
  var springs = { crisp: [24, 0.8], "default": [15, 0.72], heavy: [10, 0.92], playful: [18, 0.45] };
  /** Seeded generator (mulberry32): T.rand(7)() gives the same sequence every build. */
  function rand(seed) {
    var a = (seed === undefined ? 1 : seed) >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function noise(x) { var i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u); }

  // ── Colour ────────────────────────────────────────────────────────────────
  function rgb(c) {
    if (c instanceof Array) return c.length > 3 ? c.slice(0, 3) : c;
    var h = String(c).replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  }
  function hex(c) {
    if (typeof c === "string") return c;
    function p(v) { var s = Math.round(clamp(v) * 255).toString(16); return s.length < 2 ? "0" + s : s; }
    return "#" + p(c[0]) + p(c[1]) + p(c[2]);
  }
  function rgba(c) { var x = rgb(c); return [x[0], x[1], x[2], 1]; }

  // ── Comps ────────────────────────────────────────────────────────────────
  var current = null; // the comp new layers go into
  function open(comp) { app.run("comp.open", { comp: comp.id }); current = comp; return comp; }
  function film(o) {
    o = o || {};
    var name = F.comp || "Film";
    var comp = app.project.items.addComp(name, F.width, F.height, 1, F.duration, F.fps);
    comp.bgColor = rgb(o.background || "#000000");
    open(comp);
    if (o.motionBlur !== false) {
      app.run("comp.setSwitch", { "switch": "motionBlur", value: true });
      app.run("comp.settings", { comp: comp.id, shutterAngle: o.shutterAngle || 180 });
    }
    T.comp = comp;
    return comp;
  }
  /**
   * A scene: its own comp (local time from 0) placed in the current comp at `start`.
   * build(sceneComp) adds its layers; returns the scene's layer in the parent comp.
   */
  function scene(name, start, duration, build, o) {
    o = o || {};
    var parent = current;
    var comp = app.project.items.addComp(name, o.width || parent.width, o.height || parent.height, 1, duration, F.fps);
    comp.bgColor = rgb(o.background || "#000000");
    open(comp);
    if (o.motionBlur !== false) app.run("comp.setSwitch", { "switch": "motionBlur", value: true });
    build(comp);
    open(parent);
    var layer = parent.layers.add(comp);
    layer.startTime = start;
    if (o.motionBlur !== false) blur(layer, true);
    return layer;
  }
  /** Runs fn with `comp` as the comp new layers go into. */
  function within(comp, fn) { var back = current; open(comp); try { return fn(comp); } finally { open(back); } }

  // ── Layers ───────────────────────────────────────────────────────────────
  function byId(id) {
    for (var i = 1; i <= current.numLayers; i++) if (current.layer(i).id === id) return current.layer(i);
    throw new Error("No layer " + id + " in " + current.name);
  }
  function finish(layer, o) {
    if (o.position) set(layer, "transform/position", o.position);
    if (o.anchor) set(layer, "transform/anchor", o.anchor);
    if (o.scale !== undefined) set(layer, "transform/scale", typeof o.scale === "number" ? [o.scale, o.scale, 100] : o.scale);
    if (o.rotation !== undefined) set(layer, "transform/rotation", o.rotation);
    if (o.opacity !== undefined) set(layer, "transform/opacity", o.opacity);
    if (o.blend) app.run("layer.setBlendMode", { layers: [layer.id], mode: o.blend });
    if (o.in !== undefined || o.out !== undefined) span(layer, o.in, o.out);
    if (o.blur) blur(layer, true);
    if (o.threeD) three(layer, true);
    if (o.parent) layer.parent = o.parent;
    return layer;
  }
  /** A full-frame (or sized) solid. */
  function solid(color, o) {
    o = o || {};
    var r = app.run("layer.newSolid", { color: hex(color), name: o.name || "Solid", width: o.width || current.width, height: o.height || current.height });
    return finish(byId(r.layer), o);
  }
  /**
   * Text with a real font: o.font family + o.style ("Bold", "Black"…) from `thesium fonts`.
   * o.size, o.fill, o.tracking (1/1000 em), o.leading, o.justify (left|center|right),
   * o.box [x, y, w, h] for paragraph text, o.position, o.stroke, o.strokeWidth, o.allCaps.
   * o.anchorAt "center" (default) | "left" | "right" | "baseline": what `position` places.
   */
  function text(content, o) {
    o = o || {};
    var p = { text: content, name: o.name || String(content).slice(0, 32), font: o.font || "Inter", style: o.style || "Regular", size: o.size || 96, fill: hex(o.fill || "#ffffff"), justify: o.justify || "center" };
    if (o.tracking !== undefined) p.tracking = o.tracking;
    if (o.leading !== undefined) p.leading = o.leading;
    if (o.box) p.box = o.box;
    if (o.stroke) { p.stroke = hex(o.stroke); p.applyStroke = true; p.strokeWidth = o.strokeWidth || 2; }
    if (o.allCaps) p.allCaps = true;
    var r = app.run("layer.newText", p);
    var layer = byId(r.layer);
    // Point text hangs from its baseline; anchor it on its visual bounds so `position` means
    // what a designer expects: the centre (default), the left or right edge's middle, or the baseline.
    var mode = o.anchorAt || "center";
    if (mode !== "baseline" && !o.anchor) {
      var b = layer.sourceRectAtTime(0, false);
      var x = mode === "left" ? b.left : mode === "right" ? b.left + b.width : b.left + b.width / 2;
      set(layer, "transform/anchor", [x, b.top + b.height / 2, 0]);
    }
    if (!o.box && !o.position) set(layer, "transform/position", [current.width / 2, current.height / 2]);
    return finish(layer, o);
  }
  /** A shape layer: kind rect|rounded|ellipse|star|polygon|none; o.size [w, h], o.fill, o.stroke, o.strokeWidth. */
  function shape(kind, o) {
    o = o || {};
    var p = { kind: kind || "rect", name: o.name || kind };
    if (o.size) p.size = o.size;
    if (o.fill === false || o.fill === null) p.fill = false; else if (o.fill) p.fill = hex(o.fill);
    if (o.stroke) { p.stroke = hex(o.stroke); p.strokeWidth = o.strokeWidth || 4; }
    var r = app.run("layer.newShape", p);
    var layer = byId(r.layer);
    if (!o.position) set(layer, "transform/position", [current.width / 2, current.height / 2]);
    return finish(layer, o);
  }
  /** Adds a shape item (trim, repeater, round, wiggle, gfill…) to a shape layer; returns its path. */
  function shapeItem(layer, kind, group) {
    var r = app.run("layer.addShapeItem", group ? { layer: layer.id, kind: kind, group: group } : { layer: layer.id, kind: kind });
    return r.path;
  }
  /** Path of a workspace file, for imports. */
  function asset(rel) { return F.root + "/" + String(rel).replace(/^\/+/, ""); }
  var imported = {};
  /** Imports a file once and returns its footage item. */
  function footage(rel) {
    if (!imported[rel]) imported[rel] = app.project.importFile(new ImportOptions(new File(asset(rel))));
    return imported[rel];
  }
  /** Places an image or video from the film folder; o.fit "cover" | "contain" | "none" (default cover). */
  function image(rel, o) {
    o = o || {};
    var item = footage(rel);
    var layer = current.layers.add(item);
    var fit = o.fit || "cover";
    if (fit !== "none") {
      var w = o.width || current.width, h = o.height || current.height;
      var k = fit === "cover" ? Math.max(w / item.width, h / item.height) : Math.min(w / item.width, h / item.height);
      set(layer, "transform/scale", [k * 100, k * 100, 100]);
    }
    if (!o.position) set(layer, "transform/position", [current.width / 2, current.height / 2]);
    return finish(layer, o);
  }
  function nul(name, o) { var r = app.run("layer.newNull", { name: name || "Null" }); return finish(byId(r.layer), o || {}); }
  function adjustment(name, o) { var r = app.run("layer.newAdjustment", { name: name || "Adjustment" }); return finish(byId(r.layer), o || {}); }
  /** A camera (comp gets 3D layers through three()). o: preset "35mm", position, poi, dof, focusDistance, aperture. */
  function camera(o) {
    o = o || {};
    var p = { name: o.name || "Camera", type: o.type || "twoNode", preset: o.preset || "35mm" };
    var keys = ["zoom", "focalLength", "dof", "focusDistance", "aperture", "fStop", "blurLevel", "position", "poi"];
    for (var i = 0; i < keys.length; i++) if (o[keys[i]] !== undefined) p[keys[i]] = o[keys[i]];
    return byId(app.run("layer.newCamera", p).layer);
  }
  /** A light: kind Spot|Point|Parallel|Ambient|Environment, color, intensity, position, poi, castsShadows… */
  function light(o) {
    o = o || {};
    var p = { name: o.name || (o.kind || "Spot") + " Light" };
    for (var k in o) if (k !== "name") p[k] = k === "color" ? hex(o[k]) : o[k];
    return byId(app.run("layer.newLight", p).layer);
  }

  // ── Switches and time ─────────────────────────────────────────────────────
  function sw(layer, name, on) { app.run("layer.setSwitch", { layers: [layer.id], "switch": name, value: on !== false }); return layer; }
  function blur(layer, on) { return sw(layer, "motionBlur", on); }
  function three(layer, on) { return sw(layer, "threeD", on); }
  function blend(layer, mode) { app.run("layer.setBlendMode", { layers: [layer.id], mode: mode }); return layer; }
  /** Uses `matte` (the layer above it in the stack) as this layer's track matte: alpha|alphaInverted|luma|lumaInverted. */
  function matte(layer, matteLayer, kind) { app.run("layer.setTrackMatte", { layer: layer.id, matte: matteLayer.id, kind: kind || "alpha" }); return layer; }
  /** Trims a layer to [inT, outT) comp seconds. */
  function span(layer, inT, outT) {
    var p = { layers: [layer.id] };
    if (inT !== undefined) p["in"] = inT;
    if (outT !== undefined) p.out = outT;
    app.run("layer.timing", p);
    return layer;
  }

  // ── Properties and keyframes ──────────────────────────────────────────────
  /** Sets a static value by path ("transform/position", "effects/#1/radius", "contents/trim/end"…). */
  function set(layer, path, value) { app.run("prop.set", { layer: layer.id, path: path, value: value }); return layer; }
  function get(layer, path, t) { return app.run("prop.get", t === undefined ? { layer: layer.id, path: path } : { layer: layer.id, path: path, time: t }).value; }
  /** [outInfluence of the earlier key, inInfluence of the later key] for each named feel. */
  var FEEL = {
    smooth: [33.33, 33.33], easy: [33.33, 33.33], out: [12, 85], "in": [85, 12], inOut: [60, 60],
    expo: [5, 92], outExpo: [5, 92], inExpo: [92, 5], snap: [70, 82], heavy: [40, 90], gentle: [25, 50]
  };
  /**
   * Keyframes by path: keys = [[t, value], [t, value, feel], …]. A key's feel shapes the move
   * that ends on it: linear | hold | smooth | out | in | inOut | expo | inExpo | snap | heavy | gentle,
   * defaulting to `feel` (default "out"). Times are comp seconds.
   */
  function key(layer, path, keys, feel) {
    feel = feel || "out";
    var start = layer.startTime || 0;
    for (var i = 0; i < keys.length; i++)
      app.run("prop.addKey", { layer: layer.id, path: path, time: keys[i][0], timeBase: "comp", value: keys[i][1] });
    for (var j = 1; j < keys.length; j++) {
      var f = keys[j][2] || feel;
      var a = keys[j - 1][0] - start, b = keys[j][0] - start;
      if (f === "linear" || f === "hold") {
        // The move into key j: the earlier key's outgoing side decides it (hold keeps its value).
        app.run("keys.select", { keys: [{ layer: layer.id, path: path, time: a }] });
        app.run("keys.interpolation", { out: f });
        if (f === "linear") {
          app.run("keys.select", { keys: [{ layer: layer.id, path: path, time: b }] });
          app.run("keys.interpolation", { "in": "linear" });
        }
        continue;
      }
      var inf = FEEL[f] || FEEL.out;
      app.run("keys.setEase", { layer: layer.id, path: path, time: a, side: "out", speed: 0, influence: inf[0] });
      app.run("keys.setEase", { layer: layer.id, path: path, time: b, side: "in", speed: 0, influence: inf[1] });
    }
    app.run("keys.deselectAll", {});
    return layer;
  }
  /**
   * Bakes any curve: one key per frame (or every `o.every` frames) from t0 to t1 of fn(t),
   * linear between keys. Use it for springs, overshoots, noise, anything the web kit can express.
   */
  function anim(layer, path, fn, t0, t1, o) {
    o = o || {};
    var step = (o.every || 1) / F.fps;
    var times = [];
    for (var t = t0; t < t1 - 1e-6; t += step) times.push(Math.round(t * F.fps) / F.fps);
    times.push(t1);
    var start = layer.startTime || 0;
    for (var i = 0; i < times.length; i++)
      app.run("prop.addKey", { layer: layer.id, path: path, time: times[i], timeBase: "comp", value: fn(times[i]) });
    var sel = [];
    for (var k = 0; k < times.length; k++) sel.push({ layer: layer.id, path: path, time: times[k] - start });
    app.run("keys.select", { keys: sel });
    app.run("keys.interpolation", { interpolation: "linear" });
    app.run("keys.deselectAll", {});
    return layer;
  }
  /** A spring from `from` to `to` starting at t0 (numbers or arrays), baked for `duration` seconds. */
  function springTo(layer, path, from, to, t0, o) {
    o = o || {};
    var s = springs[o.feel || "default"] || springs["default"];
    var w = o.w || s[0], z = o.z || s[1];
    var duration = o.duration || Math.min(2.5, 6 / (z * w) + 0.2);
    return anim(layer, path, function (t) {
      var p = spring(t - t0, w, z);
      if (from instanceof Array) { var v = []; for (var i = 0; i < from.length; i++) v.push(lerp(from[i], to[i], p)); return v; }
      return lerp(from, to, p);
    }, t0, t0 + duration, o);
  }
  /** An expression (JavaScript, After Effects object model: time, value, wiggle, thisComp…). */
  function expr(layer, path, code) { app.run("prop.setExpression", { layer: layer.id, path: path, expression: code }); return layer; }

  // ── Effects ──────────────────────────────────────────────────────────────
  /**
   * Applies an effect by name ("Glow", "Gaussian Blur", "Fractal Noise", "CC Particle World"…)
   * and sets parameters by their path ids (see `thesium effects <name>`): {radius: 40, intensity: 1.5}.
   * Returns the effect's base path, e.g. "effects/#2", for keyframing its parameters.
   */
  function fx(layer, name, values) {
    var r = app.run("effect.apply", { effect: name, layers: [layer.id] });
    var base = r.paths ? r.paths[0] : "effects/#" + countEffects(layer);
    if (values)
      for (var k in values) {
        var v = typeof values[k] === "string" && values[k].charAt(0) === "#" ? rgba(values[k]) : values[k];
        try {
          set(layer, base + "/" + k, v);
        } catch (e) {
          throw new Error('Effect "' + name + '" has no parameter "' + k + '". Its parameters: ' + effectParams(name).join(", "));
        }
      }
    return base;
  }
  /** Parameter ids of an effect, for messages and exploration. */
  function effectParams(name) {
    var list = app.run("effect.list", { filter: name });
    var all = list.effects || list;
    for (var i = 0; i < all.length; i++)
      if (all[i].name === name) {
        var ids = [];
        for (var j = 0; j < all[i].params.length; j++) ids.push(all[i].params[j].id);
        return ids;
      }
    return [];
  }
  function countEffects(layer) { var e = layer.property("Effects"); return e ? e.numProperties : 1; }
  /** Glow tuned for type and light: o.threshold, o.radius, o.intensity. */
  function glow(layer, o) {
    o = o || {};
    return fx(layer, "Glow", { threshold: o.threshold === undefined ? 55 : o.threshold, radius: o.radius || 40, intensity: o.intensity || 1.2 });
  }
  /** A layer style: dropShadow|innerShadow|outerGlow|innerGlow|bevelEmboss|satin|colorOverlay|gradientOverlay|stroke. */
  function style(layer, kind) { app.run("layer.style.add", { style: kind, layers: [layer.id] }); return layer; }

  // ── Text motion ──────────────────────────────────────────────────────────
  /**
   * Reveals text by characters, words or lines: each unit travels from `from` (offsets, opacity,
   * blur) to rest in a cascade between t0 and t0 + duration.
   * o: by "chars"|"words"|"lines", duration, from {y, x, opacity, blur, scale, rotation, tracking}, smoothness 0..100, feel.
   */
  function reveal(layer, t0, o) {
    o = o || {};
    var from = o.from || { y: 60, opacity: 0, blur: 12 };
    var props = [];
    if (from.y !== undefined || from.x !== undefined) props.push("position");
    if (from.opacity !== undefined) props.push("opacity");
    if (from.blur !== undefined) props.push("blur");
    if (from.scale !== undefined) props.push("scale");
    if (from.rotation !== undefined) props.push("rotation");
    if (from.tracking !== undefined) props.push("tracking");
    app.run("layer.addTextAnimator", { layer: layer.id, properties: props });
    var base = "text/animators/animator";
    if (from.y !== undefined || from.x !== undefined) set(layer, base + "/properties/position", [from.x || 0, from.y || 0, 0]);
    if (from.opacity !== undefined) set(layer, base + "/properties/opacity", from.opacity);
    if (from.blur !== undefined) set(layer, base + "/properties/blur", [from.blur, from.blur]);
    if (from.scale !== undefined) set(layer, base + "/properties/scale", [from.scale, from.scale, 100]);
    if (from.rotation !== undefined) set(layer, base + "/properties/rotation", from.rotation);
    if (from.tracking !== undefined) set(layer, base + "/properties/tracking", from.tracking);
    var by = { chars: 0, words: 2, lines: 3 }[o.by || "chars"];
    var sel = base + "/selectors/rangeSelector";
    set(layer, sel + "/advanced/basedOn", by);
    set(layer, sel + "/advanced/shape", 1); // ramp up: units ahead of the edge stay at `from`
    set(layer, sel + "/advanced/smoothness", o.smoothness === undefined ? 100 : o.smoothness);
    var d = o.duration || 0.9;
    key(layer, sel + "/start", [[t0, 0], [t0 + d, 100, o.feel || "out"]]);
    return layer;
  }

  // ── The shared clock ──────────────────────────────────────────────────────
  /** timeline.json: bpm, sections and cues, with beat(n) and bar(n) helpers in seconds. */
  function timeline() {
    var f = new File(F.root + "/timeline.json");
    var data = { sections: [], cues: [] };
    if (f.exists && f.open("r")) { data = JSON.parse(f.read()); f.close(); }
    var bpm = data.bpm || 120, offset = data.offset || 0, bpb = data.beatsPerBar || 4, spb = 60 / bpm;
    data.beat = function (n) { return offset + n * spb; };
    data.bar = function (n) { return offset + n * bpb * spb; };
    data.section = function (name) {
      for (var i = 0; i < (data.sections || []).length; i++) if (data.sections[i].name === name) return data.sections[i];
      throw new Error("timeline.json has no section " + name);
    };
    return data;
  }

  return {
    film: film, scene: scene, within: within, comp: null, params: F.params || {}, info: F,
    clamp: clamp, lerp: lerp, seg: seg, env: env, ease: ease, spring: spring, springs: springs, rand: rand, hash: hash, noise: noise,
    rgb: rgb, hex: hex, rgba: rgba,
    solid: solid, text: text, shape: shape, shapeItem: shapeItem, image: image, footage: footage, asset: asset,
    nul: nul, adjustment: adjustment, camera: camera, light: light,
    blur: blur, three: three, blend: blend, matte: matte, span: span, sw: sw,
    set: set, get: get, key: key, anim: anim, springTo: springTo, expr: expr,
    fx: fx, glow: glow, style: style, reveal: reveal, timeline: timeline,
    log: function () { writeLn(Array.prototype.slice.call(arguments).join(" ")); }
  };
})();
