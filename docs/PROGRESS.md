# Thesium build log and resume point

Last updated 2026-10-20. Design: [BLUEPRINT.md](BLUEPRINT.md).

## Done and verified
- Core, CLI, MCP server (20 tools), review studio, Claude Code plugin (skill, critic, MCP),
  `capture`, `qr`, `make` (verified Claude Code loads the plugin's skill, critic and MCP server).
- Engines verified end to end: web, EffectCraft, HyperFrames (stills, check, params) and Remotion
  4.0.537 (stills, params, check, preview; bundles once per source state, three stills 41 s -> 5 s).
  `command` by design.
- Showcase: `examples/thesium-launch` (EffectCraft, 30 s, two review rounds, QA pass, -14.1 LUFS,
  -1.0 dBTP); media in `docs/media/`.
- Parity: `examples/thesium-launch-web` remade the film on the web engine (v4 master: QA pass,
  253 s with 8 motion-blur samples). `docs/media/parity-sheet.jpg` and the 720p cut
  `docs/media/thesium-launch-web.mp4` show both.
- CLI-Anything (HKUDS) considered and not adopted as a dependency; its CLIs plug in through the
  `command` engine (BLUEPRINT section 6, `knowledge/engines/command.md`).
- 13 tests (Remotion's runs when `THESIUM_TEST_REMOTION` names a node_modules with Remotion);
  tsc clean.

## Next
1. CI: the GitHub token lacks the `workflow` scope (`gh auth refresh -s workflow`), then add a
   workflow running `npm run check` on Linux.
2. Text-to-speech for narration through a local model.
3. Re-test EffectCraft's "avoid" list on new releases; use `--progress` when it exists.
4. The parity benchmark on Remotion and HyperFrames: the same film, scored by the critic.
