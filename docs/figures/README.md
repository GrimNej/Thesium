# Figures

The pictures in the [guide](../GUIDE.md) and the [README](../../README.md). Each is an HTML page
in `src/`, rendered to PNG by Thesium's own headless Chrome client with the bundled fonts, so the
figures use the same type and palette as the films.

```
node docs/figures/build.mjs            # every figure
node docs/figures/build.mjs engines    # one
```

| Figure | Shows |
| --- | --- |
| `banner.png` | the README banner, over real frames from the example films |
| `how-it-works.png` | you, the model, the studio and the engine, and what each does |
| `quickstart.png` | install, ask, watch |
| `workflow.png` | the director's eight steps and its two loops |
| `studio.png` | the review studio, annotated |
| `engines.png` | the five engines and the same frame from four of them |
| `narration.png` | script, voice, hearing check, mix (drawn from the narrated example's own data) |
| `film-folder.png` | what is in a film's folder and who writes each part |
| `quality.png` | the five quality gates, with real output |

`src/frames/` holds frames taken from the example films' masters and a screenshot of the studio.

**Logos.** Tool icons in `src/logos/*.svg` come from [Simple Icons](https://simpleicons.org)
(CC0, version 16.35.0). The EffectCraft, Remotion and HyperFrames marks (`src/logos/*.png`) are
rendered from each project's own repository. All product names and logos belong to their owners
and are used only to refer to their projects.
