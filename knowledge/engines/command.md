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
