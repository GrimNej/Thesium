# Case studies

Six public films made with Opus 5.5 and code, collected and analysed by xilo
(@xilo2991) in "Getting started with Opus 5.5 video" (X article, 2026-09-29).
Prompts are translated from the article's Chinese except where the creator wrote
in English. Learn the technique; never copy the film.

---

## 1. Pixel wizard: Canvas 2D only (@majidmanzarpour)

An 11-second clip: a ~5 s loop played twice. The wizard bobs, raises a staff,
blue sparks spiral into the gem, the staff thrusts, a ring and missile fire, recoil.

**Why it works**

- Everything is drawn on a **128×96 logical canvas**, then scaled by the largest
  integer factor with smoothing off. Every pixel is a crisp square.
- **Poses are quantised to ~10 fps** (classic sprite feel) while sparks and missiles
  update every frame, so it never looks laggy.
- The character is built from rectangles, with staff angle, arm height, head tilt
  and robe sway as parameters: one rig, many actions.

**Prompt (translated)**

> Create a single standalone HTML file rendering a pixel-art wizard casting a spell
> with vanilla JavaScript and Canvas 2D. No external assets, libraries or requests.
>
> Rendering: draw everything onto a fixed 128×96 offscreen canvas, then scale it by the
> largest integer factor that fits the window onto a full-screen display canvas, centred,
> with `imageSmoothingEnabled = false` and CSS `image-rendering: pixelated`. Snap all
> drawing to integer logical coordinates. No subpixel positions, antialiasing, gradients
> or shadowBlur. Fixed palette of about 24 colours: deep blues and purples for the night
> sky, warm robe colours, 3–4 bright magic colours. Every pixel comes from the palette.
>
> Character: build the wizard procedurally from filled rects and pixel runs, about 24×32
> logical pixels: bent pointed hat, long beard, two-tone robe with dark outline, staff
> with a gem. Pose is parametric (staff angle, arm raise, head tilt, robe sway).
> Parameters change smoothly but are quantised to the pixel grid every frame, so although
> the loop runs at 60 fps the motion reads like 8–12 fps sprite animation.
>
> Animation: a looping state machine: idle (two-frame bob, beard sway) → charge (staff
> raised, gem flicker, sparks spiralling inward) → cast (bright flash, missile crosses the
> screen, 1–2 px screen shake) → recover. Ease pose parameters between keyframes.
> Preallocated, recycled particle pool; particles fade white → magic colour → dark.
> Snap particles to the grid. Fixed 60 Hz timestep.
>
> Scene: minimal backdrop: dark sky, a few twinkling 1-px stars, a moon, stone ground.
> Silhouette must read clearly. The gem casts a 1-px rim light that brightens when
> charging and casting.
>
> Quality bar: crisp pixels at any window size, seamless loop, steady 60 fps, clear
> silhouette. It should look like polished 16-bit game character animation, not shrunken
> vector art.

*In Thesium, replace the fixed-timestep loop with a pure function of time (`render(t)` on the web engine, keyframes or expressions elsewhere) and derive the state machine from `t`.*

---

## 2. One shape, never cut: UI morph on the beat (@twoclipping)

A single black-and-white shape morphs through 14 UI states, every change triggered by a
real cursor click or drag and landing on a 120 BPM beat. Fast morphs carry motion blur.

**Why it works:** springs (closed-form, summed per target change), a measured beat grid,
4-subframe motion blur, synthesized UI sounds placed on measured peaks.

**Prompt (creator's English)**

```text
<inputs>
Ask me for: 8 to 12 UI states I want the shape to become (e.g. button, loader, player,
slider, toggle, tabs, chart, command palette, toast), pure black and white or one accent
color, and a royalty-free song around 120 BPM (e.g. Mixkit, free for commercial use).
</inputs>

<direction>
Dribbble-level UI motion. One shape, never cut: every state is the same element morphing
its size, radius and color while its content swaps with a short blur. A cursor drives
every change with real clicks and drags. Light warm-gray canvas, black and white
components, one clean UI font (Geist). Springs everywhere, a tiny overshoot at most. The
camera zooms so each state fills the frame. The last frame is the first frame, so it loops.
Banned: bouncy easing, particle bursts, glows, gradients on UI chrome, mismatched icon
strokes, dead time, anything that looks like a template.
</direction>

<structure>
120 BPM, 7 bars, something happens on every beat.
Button → loader → check → dynamic island → music player with a play/pause morph → scrub
the progress bar → it becomes a volume slider that stretches when dragged past max → a
toggle flips on the beat → the knob becomes a liquid tab indicator → the tabs open into a
chart that draws itself, with a tooltip on hover → it collapses into ⌘K → type to filter
→ enter → toast → back to the button.
</structure>

<build>
1. One HTML file, square 1440x1440. Every style is computed from time inside seek(t): no
   CSS transitions, no timers, no state carried between frames.
2. Springs are closed-form step responses. A value that changes target many times is the
   sum of one spring per change, so it stays a pure function of time.
3. The tab indicator's two edges ride different springs, so the leading edge stretches
   ahead of the trailing one. Same trick for the toggle knob.
4. Drags are direct manipulation: while the cursor is held, the value is computed from
   its position. On release it springs back from wherever it was.
5. Analyze the song with numpy for the beat grid and start on a downbeat. Place every UI
   sound by its measured peak.
6. Render with Playwright: 4 subframes per frame, blended with ffmpeg tmix for motion
   blur at 60fps.
7. Render one frame per beat before the full render. Fix anything off the grid, cramped
   or hard to read.
</build>

<gotchas>
Never put will-change on anything the camera scales or the text renders blurry. Text that
swaps inside a morphing container needs its own enter and exit timing or it overlaps.
Make the last frame identical to the first, cursor position and speed included, or the
loop stutters.
</gotchas>

<start>
Ask me for the inputs, then show me the state list on the beat grid before you write any code.
</start>
```

**Review prompt the article pairs with it (translated):**

> Check the video: extract frames first, then review as a strict motion director looking
> for faults; do not argue for yourself. Score 1–10: does the first 2 s grab, is it
> readable at phone size, is motion natural (no linear slides, no frozen beats), is there
> enough change (something new every 2–4 s), composition, are sound and picture in sync.
> List the three worst problems with timestamps, especially: overlapping text during
> swaps, centred-big-type-on-gradient default frames, stray corner labels and borders,
> text blurred by scaling, stutter at the loop seam. Re-render the problem parts, make a
> new frame sheet and new scores. Repeat until every item is above 8.

---

## 3. History of video games: Canvas, shaders and 3D mixed (@prasenx)

A 2-minute epic that changes drawing method by era, bound by one synthesized score.

- **Canvas 2D** for the pixel eras; **WebGL shaders** for CRT curvature, scanlines and
  glow over that canvas; **Three.js** for the post-1993 corridors, castles and voxel worlds;
  **Python-synthesized score**, picture cut to the music.
- A shader pass over the same pixel content turned a flat canvas into a convincing CRT. In
  the article's test it multiplied render time (7 s → 48 s for 90 frames). Texture is worth
  it, but budget for it.
- **The prompt was seven lines.** It stated the desired effect and left every decision to
  the model:

> Make a 2-minute cinematic video about the history of video games. Epic and moving, like
> a documentary trailer. Go all out.
> Compose the score yourself entirely in code: no samples, no audio files, no virtual
> instruments. Cut the picture to the music.
> 1920×1080, 60 fps. Do not download any images or assets; generate every frame in code.
> Mix picture and music and render to MP4.

---

## 4. Dancer: a video model for the performer, code for the world (@Gorden_Sun)

A 15-second Grok clip of a dancer on a plain green background became a designed film:
keyed performer, code-built backgrounds, big type, tape strips, split screens, 3D text
orbiting the dancer, everything switching on the beat while the performance stays intact.

Three jobs for the model: **key** the green screen by colour, **build the scenes and
motion** in web code, **set the rhythm** so backgrounds and type change on beats. In
Thesium: `node thesium.mjs frames assets/<clip>.mp4 --key green`, then draw the keyed frames with `frames()` from `/kit/web/media.js` (web), or apply Keylight to the clip layer (EffectCraft).

House rules the article recommends for any project (translated):

> **Rendering:** every video is determined by time only: `window.render(t)` draws second t.
> No CSS animation, no timers, no state between frames, seeded randomness.
> **Picture:** banned defaults: centred big type on a gradient, all elements fading in
> together, corner labels and borders, glows on UI. One heading face, one text face, one
> accent colour unless told otherwise. Something new every 2–4 s.
> **Sound:** if no music is given, synthesize score and SFX in code on the beat, −14 LUFS.
> **Before showing me:** make a frame sheet, score yourself, fix the three worst problems,
> and only show me when every item is 8+.

---

## 5. Attention → AGI: a 3-minute Remotion essay (@kimmonismus)

Made in Claude Code with Remotion: ~7,400 lines of React/TypeScript, every image drawn in
SVG and Canvas, an open-source TTS voice, a Python-synthesized score; about an hour.

**Why it works:** one recurring protagonist (a glowing token, the word "the") carries the
film through every era; a written storyboard first; each scene checked with 3–4 stills
before moving on; facts guarded (uncertain claims go to NOTES.md); transitions grow from
the content (a network morphs, the camera flies through a node); dense and calm moments
alternate, with breathing room before the reasoning scene and the final beat.

**Prompt (translated, abridged where it lists scenes)**

> You are a motion designer and creative director making a 3-minute animated short,
> entirely built in code and rendered to MP4. Title: "Attention Is All You Need → AGI".
> It should feel like a cinematic visual essay, not slides or a timeline infographic:
> Kurzgesagt meets the opening of a Pixar film: emotional, smart, precise.
> Remotion, 1920×1080, 30 fps, exactly 180 s. One composition per scene, sequenced in a
> master composition. No external images or footage: everything from SVG, Canvas, CSS and
> code-generated particles. Before building, write STORYBOARD.md with timing, visuals,
> on-screen text and transitions for each scene. Then build scene by scene; after each,
> render 3–4 stills and critique them; fix layout, overlap, legibility and rhythm first.
> Through-line: a glowing token, the word "the", travels through every era …
> (eight dated scenes from a dark cold open to a planet-scale network and a title card)
> Rules: accuracy matters: years, names and paper titles must be right; when unsure,
> leave it out and list uncertainties in NOTES.md. At most ~8 words on screen at once,
> each text held long enough to read (≥ 2.5 s). One display face plus a monospace for
> "model output". Springs and easing, never linear. Transitions grow from the content.
> Dark ground with one warm accent that shifts with the eras. Details and easter eggs for
> attentive viewers. Alternate dense and calm moments; give the reasoning scene and the
> AGI beat room to breathe. Do the whole pipeline autonomously.

---

## 6. "Show me what an incredible motion designer you are" (@himanshutwtxs)

> Make a dynamic 15-second motion graphics video that shows what an incredible motion
> designer you are, like it's your showreel for a résumé. Go all out.

A one-line prompt on maximum effort produced a dense showreel. The article's point:
one-liners test the ceiling but are not controllable. For real work, a structured brief
(role, inputs, direction with bans, structure, build, gotchas, start) is what makes
results repeatable.

---

## Lessons the article draws

- Opus 5.5 does not output video; it writes code that draws frames.
- Seven stacks cover most looks: Canvas 2D, HTML/CSS/SVG, WebGL shaders, Three.js,
  p5.js + p5.brush, HyperFrames/Remotion, Manim.
- XML-tagged briefs outperform loose Markdown when a prompt mixes instructions,
  background and examples.
- The ban list inside `<direction>` matters most: without it the model returns to its
  default look.
- Raise effort when results disappoint; keep house rules in a project CLAUDE.md;
  make the model review its own frames until it passes.
