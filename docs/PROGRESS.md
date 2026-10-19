# Thesium build log

Last updated 2026-10-20, version 0.1.0. Design: [BLUEPRINT.md](BLUEPRINT.md).

## Built and verified

- **Core**: the frame contract, manifest, film workspaces, CLI, MCP server (20 tools), review
  studio, Claude Code plugin (skill, critic, MCP; `claude plugin validate` passes for the plugin
  and the marketplace), `capture`, `qr`, `make` (headless Claude Code director).
- **Engines**, each verified with stills, parameters, the determinism check and a master that
  passes QA: web, EffectCraft 0.11.1, Remotion 4.0.537 (bundled once per source state; three
  stills 41 s -> 5 s), HyperFrames 0.8.177, and command (shell templates, including quoted paths
  on Windows).
- **Sound**: scores and SFX in code, beat tracking, checks, mastering to -14 LUFS / -1 dBTP with a
  true-peak guard and a 0.4 s end fade. **Narration**: `sound voice` speaks timed lines locally
  (Kokoro, system voice, any TTS command, recorded takes), caches lines, levels to -16 LUFS,
  writes line timings, and transcribes the result with faster-whisper to check every word
  (two-listener pass for invented names; phonemes for anything misheard). The music ducks
  automatically for 10 LU of separation; master QA measures the balance and transcribes the mix.
- **Examples**: `thesium-launch` (EffectCraft, 30 s), `thesium-launch-web` (the same film on the
  web engine; `docs/media/parity-sheet.jpg`), `thesium-voice` (24 s narrated film drawn from the
  hearing check; voice 10 LU over the music, 54 of 54 words heard in the final mix).
- **Tests**: 17 (core, frame check, QR, MCP, end-to-end web, command, EffectCraft and Remotion
  films, narration). CI runs them on Linux with Node 22 and 24 on every push; all pass on
  Windows locally (`THESIUM_TEST_REMOTION` enables the Remotion test).

## Decisions worth remembering

- CLI-Anything (HKUDS) was considered and not adopted as a dependency; its CLIs fit the command
  engine (BLUEPRINT section 6).
- Whisper alone cannot judge a mix: in testing it heard every word with the music 7.7 LU louder
  than the voice, so narration QA measures the balance as well.
- EffectCraft issues found while testing are worked around in Thesium; reporting them upstream
  waits for the owner's go-ahead.

## Next

See the roadmap in [BLUEPRINT.md](BLUEPRINT.md#18-roadmap): parity films on Remotion and
HyperFrames, EffectCraft re-tests on new releases, macOS and Windows CI runners, narration beyond
English.
