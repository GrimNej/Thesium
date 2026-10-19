# Engine: command

Bring any renderer that has a command line: Blender, Manim, Motion Canvas, a game engine, your own
tool. Describe how to draw one frame, and Thesium gives that tool the same studio as every other
engine: stills, strips, motion blur, previews, checks, mastered sound, critic, review studio.

## Contract

`thesium.json`:

```json
"engine": "command",
"engineOptions": {
  "command": {
    "build": "blender -b film/scene.blend --python film/build.py",
    "frame": "blender -b film/scene.blend --python-expr \"import bpy; bpy.context.scene.frame_set({frame})\" -o {outBase} -F PNG -f {frame}",
    "frameFile": "{outBase}{frame4}.png",
    "sequence": "blender -b film/scene.blend -o {dir}/f_###### -F PNG -s {fromFrame} -e {toFrame} -a",
    "parallel": 2
  }
}
```

- `frame` (required) writes the frame at `{t}` seconds (or frame `{frame}`) to `{out}`, or to
  `frameFile` when the tool picks its own name.
- `sequence` (optional) renders `[from, to)` at `{fps}` into `{dir}` in one call; any numbered
  image names work.
- `build` (optional) runs before rendering.
- Placeholders: `{t}`, `{frame}`, `{frame4}`, `{frame6}`, `{out}`, `{outBase}`, `{from}`, `{to}`, `{fromFrame}`, `{toFrame}` (inclusive),
  `{fps}`, `{dir}`, `{width}`, `{height}`, `{params}` (a JSON file with the film's facts and tuned
  parameters), `{workspace}`. Commands run through the shell in the film folder.

The same rules hold as everywhere: the frame at `t` depends only on `t` (and the params file), the
output size matches thesium.json, and nothing is fetched while rendering. `thesium check`'s
determinism test applies.

## Tools wrapped by CLI-Anything

[CLI-Anything](https://github.com/HKUDS/CLI-Anything) (HKUDS, Apache-2.0) generates agent-usable
command lines for desktop software (GIMP, Blender, Inkscape, Krita, Kdenlive, Shotcut, Audacity and
more), installed with `pip install cli-anything-hub` and `cli-hub install <name>`. Thesium does
not depend on it, but anything it installs is a command line, so it fits here:

- **As an engine**, a harness works when some command writes the frame at `{frame}` to an image.
  Check what its render command really does first. The Blender harness (checked 2026-10) keeps its
  own JSON model of the scene, and `render execute <out> --frame N` writes a bpy script for
  `blender --background --python`; it does not render by itself. Blender's own scripting is the
  fuller instrument for a film: write `film/build.py` with `bpy` and use the template at the top
  of this guide.
- **For material**, harnesses for image, vector and audio editors are useful for preparing
  `assets/` (a cut-out, a traced logo, a cleaned voice take). Record the tool and the steps in
  `assets/SOURCES.md` like any other source.

Rendering stays offline either way: install the harness and its software before the film is built,
never during a render.
