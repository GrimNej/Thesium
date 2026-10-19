# Thesium build log and resume point

Paused on 2026-10-19 at the owner's request. This file is the record of where the work stands,
what was decided and verified, and exactly what comes next.

## The commission (summary)

Build **Thesium**, the successor to Vmotion (`E:\Github Repos\Vmotion`): a lightweight,
efficient, engine-agnostic studio where the frontier model does the creative work and the film's
quality does not depend on the renderer (Remotion, HyperFrames, EffectCraft or anything else).
Test the claim by driving **EffectCraft** (`github.com/storytold/effectcraft`, forked to
`GrimNej/effectcraft`) to make eye-candy films. Deliver the tool as a skill and/or MCP with a
detailed blueprint, then commit and push to `github.com/GrimNej/Thesium`. The owner said not
to copy Vmotion's architecture where it is bad.

## Decisions taken (and why)

| Decision | Why |
| --- | --- |
| Thesium needs one thing from an engine: **the frame at time t**. Stills, strips, motion blur, sheets, previews, determinism checks, mastering, QA, critic and studio are engine-independent. | The "tool should not matter" requirement becomes a structural guarantee, not a hope. |
| Form: **Claude Code plugin** (director skill + critic subagent) + **zero-dependency Node CLI** + **MCP server** over the same operations layer. | Vmotion's v2 lesson: quality came from one autonomous director that can see its own frames; the Next.js app, SQLite queue, worker, Agent SDK and vector DB were overhead. |
| Plain ESM JavaScript with JSDoc types checked by `tsc` (dev only). No runtime npm dependencies. | Runs anywhere Node ≥ 22.12 runs, including from node_modules; nothing to build. |
| Own Chrome DevTools Protocol client over `--remote-debugging-pipe` instead of Playwright. | 277 ms launch, ~84 ms/frame single tab at 1080p, no dependency. |
| All pixel work through FFmpeg (sheets, labels, averaging, encoding, measurements). | Removes sharp/canvas; FFmpeg is required for mastering anyway. |
| Keep Vmotion's `synth.py` / `audiotools.py` (Python + numpy/scipy) for sound. | Proven, deterministic, good scores; porting adds risk, not quality. |
| EffectCraft films are an AE-style **build script** (`film/build.jsx`) run headless into `.ecproj`, plus a `T` kit with the same vocabulary as the web kit. | Keeps "film as code" on a layer/keyframe engine; diffable, rebuildable, deterministic. |
| Masters always go through the same FFmpeg x264/BT.709 pipeline (EffectCraft renders a PNG sequence). | Identical delivery quality across engines. |
| Style bibles keep `STYLE.md` + poster only; no preview videos. | Lightweight repository (knowledge is 2.1 MB instead of 11 MB). |

## Environment facts verified on this machine

- Node 24.14, npm, Python 3.11 (numpy 2.4.2, scipy 1.17.1, fontTools 4.62.1), FFmpeg 8.0, Chrome 155,
  Edge 155, Playwright chrome-headless-shell 1248, Claude Code 2.1.303, Rust 1.93.1 (EffectCraft
  source needs 1.95, so the signed release binary is used).
- EffectCraft fork: `GrimNej/effectcraft` (identical to upstream), cloned at `E:\Github Repos\effectcraft`
  with `upstream` remote.
- EffectCraft 0.11.1 installed (portable, SHA-256 verified) at
  `%LOCALAPPDATA%\Programs\EffectCraft\0.11.1\effectcraft-0.11.1-windows-x64-portable\`. Thesium finds it there automatically.

## EffectCraft findings (all verified by rendering)

- CLI startup ~0.2–0.4 s; 1080p frame ~75–380 ms CPU; GPU init costs ~18 s (CPU is the right default).
- Renderer already uses every core: 4 parallel range renders were slower than one. Half resolution is 3.7× faster.
- PNG sequence render is faster than its H.264 and lossless (300 frames: 19.6 s vs 22.2 s).
- Deterministic: same frame twice is identical; range render matches a single seek.
- Script sandbox: includes and file reads only from the script's own folder (and subfolders) and the
  script path must be absolute. Thesium writes `<film>/.thesium-build.jsx` for that reason.
- `run <proj> comp.open {...} comp.saveFrameAs {...}×N` renders many exact frames in one process.
- `render --progress` exists on EffectCraft main but **not** in 0.11.1; Thesium counts written frames instead.
- Variable fonts render at their default instance whatever weight is asked; PostScript font names fall back
  silently to Inter. Fix: `fonts/static/` fixed-weight instances (`fonts/make-static.py`) and selecting
  `font` + `style` via `layer.setText`. The build now fails if any text layer's font does not resolve.
- Point text anchors at its baseline: the kit centres text on its visual bounds (`sourceRectAtTime`).
- Effect point parameters are in **pixels** even though `effect.list` shows normalised defaults.
- Unbounded's E has a deliberately pointed spine (it nests against H); not a bug, documented in craft.md.
- Recipe lab results:
  - Work well: Glow; Fractal Noise fog + Tint; shape ring with Trim Paths draw-on; text reveal by chars/words
    (animator + range selector); baked spring push-in on a parent null; Lens Flare on black in Screen;
    3D shape cards + spot light + shadows + camera move; Turbulent Displace "liquid type" with an evolution
    expression; 4-Color Gradient world + CC Vignette + Add Grain on an adjustment layer; scale slam with
    CC Radial Fast Blur decaying; Echo **on a precomp**; deterministic expression particles
    (`seedRandom(i, true)` + `random()` on many small shape layers) for embers/dust.
  - Subtle: CC Light Sweep (needs higher sweep/edge intensity than defaults).
  - Did not render usefully in 0.11.1: CC Light Rays (overblown or invisible), CC Particle World (nothing
    visible even pre-rolled), CC Star Burst (invisible), Echo directly on a shape layer, god rays from a
    Brightest radial blur duplicate (hard blocky streaks). Avoid or report upstream.

## What exists now (repository state)

Committed (5 commits on `main`, not yet pushed):

- `src/core` manifest (`thesium.json`), workspace (`new`, `sync`, launcher `thesium.mjs`, house rules),
  paths, process helpers, vendored-library cache (`thesium add three|gsap|p5`).
- `src/browser` CDP client and loopback file server. `src/media` FFmpeg and audio mastering.
  `src/render/frames.js` stills/strips/videos. `src/review` frame check and language check.
- `src/engines` web, effectcraft, remotion, hyperframes, command (+ contract in `index.js`).
- `src/studio/ops.js` (operations), `sound.js`, `server.js` + `ui/index.html` (review studio),
  `src/mcp/server.js` (18 tools, images inline), `src/cli.js`, `bin/thesium.js`.
- `kit/web` (motion, media, post), `kit/effectcraft/thesium.jsx` (T kit), `kit/audio` (synth, audiotools).
- `fonts/` 9 OFL families + `fonts/static/` instances + licences + `make-static.py`.

Uncommitted work in progress (this checkpoint commits it):

- `knowledge/`: ported library (direction, craft rewritten engine-neutral, banned defaults, review,
  showcase, sound, case studies, genres, 18 types, 43 styles with posters), `plan-template.md`,
  `engines/README.md`, `engines/web.md`.
- `frames` command (video → frame sequence, optional chroma key); `effects` command prefers an exact name.

Verified end to end: web film (new → still → strip → preview → check → score/SFX → master with
sound → QA) and EffectCraft film (build → still → preview → check). MCP over stdio returns images.
Studio: notes with saved frames, tuned-parameter stills, versions, sections; screenshot checked.
`tsc` passes.

## Next steps, in order

1. `knowledge/engines/effectcraft.md` from the verified findings above (contract, T kit reference,
   craft → EffectCraft map, recipe cookbook, what to avoid in 0.11.1), plus `remotion.md`,
   `hyperframes.md`, `command.md`; update `THIRD_PARTY.md`.
2. `skills/thesium/SKILL.md` (director workflow, < 500 lines, `${CLAUDE_PLUGIN_ROOT}` paths),
   `agents/critic.md` (fresh-eyes critic, from Vmotion's 55-studio-critic + frame-checker),
   `.claude-plugin/plugin.json` + `marketplace.json` (no top-level `bin/` folder: it blocks claude.ai
   installs; the CLI lives at `bin/`, so consider renaming to `cli/` or referencing by path), `.mcp.json`.
3. Tests with `node:test` (manifest, sample times, parse size, framecheck on synthetic frames, CDP smoke,
   EffectCraft smoke when installed, MCP handshake).
4. The proof: a showcase film made with the EffectCraft engine through Thesium following the skill
   (plan → build → look → sound → check → master → critic → polish), ideally the same brief on the web
   engine to show parity. Fold any new recipe lessons back into the guide.
5. Docs: README, `docs/BLUEPRINT.md` (the detailed implementation blueprint the owner asked for),
   `docs/ARCHITECTURE.md`, CREDITS/licence (MIT for Thesium; third-party MIT, CC BY 4.0, OFL notices).
6. Commit and push to `origin main`; optionally report EffectCraft issues upstream (ask the owner first).

Scratch experiments live in the session scratchpad (`scratchpad/films/{smoke-web,smoke-ec,lab,lab2,lab3}`);
nothing there is needed to resume.
