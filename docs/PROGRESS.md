# Thesium build log and resume point

Last updated 2026-10-19 (paused by a usage limit). Design: [BLUEPRINT.md](BLUEPRINT.md).

## Done and verified
- Core, CLI, MCP server (20 tools), review studio, Claude Code plugin (skill, critic, MCP),
  `capture`, `qr`, `make` (verified Claude Code loads the plugin's skill, critic and MCP server).
- Engines verified end to end: web, EffectCraft, HyperFrames (stills, check, params). `command` by design.
- Showcase: `examples/thesium-launch` (EffectCraft, 30 s, two review rounds, QA pass, -14.1 LUFS,
  -1.0 dBTP); media in `docs/media/`.
- `examples/thesium-launch-web`: the same film on the web engine. Source complete; its v1 master
  passed QA; a v2 master (8 motion-blur samples, frameTime playhead) was rendering when work paused.
- 12 tests pass; tsc clean.

## Next
1. Re-run `node thesium.mjs master` in `examples/thesium-launch-web`, make `docs/media/parity-sheet.jpg`
   (both masters at the same times), fill the master time in its README.
2. Remotion: a test film in the scratchpad was mid `npm install`; verify still + check through the driver.
3. CI: the GitHub token lacks the `workflow` scope (`gh auth refresh -s workflow`), then add a workflow
   running `npm run check` on Linux.
4. Text-to-speech for narration; re-test EffectCraft's "avoid" list on new releases.
