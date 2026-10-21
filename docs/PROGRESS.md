# Thesium build log

Last updated 2026-10-21, version 1.0.0. Design: [BLUEPRINT.md](BLUEPRINT.md). How to use it:
[GUIDE.md](GUIDE.md).

## Built and verified

- **Core**: the frame contract, manifest, film workspaces, CLI, MCP server (20 tools; verified with
  real calls: `still` returns frames inline), review studio, Claude Code plugin (skill, critic,
  MCP; `claude plugin validate` passes for the plugin and the marketplace), `capture` (a folder per
  page), `qr`.
- **`make`**: one command from a request to a film, run for real: a 12-second promo for ffmpeg.org built from its own site, with the critic's
  review (eight findings, all fixed) and a second master, in about 43 minutes of director time. It found and
  fixed two problems on the way: Windows installs Claude Code as `claude.cmd` (now found, with the
  prompt on stdin), and a session can stop at a usage limit (`make --continue` resumes it).
- **Engines**, each verified with stills, parameters, the determinism check and a master that
  passes QA: web, EffectCraft 0.11.1, Remotion 4.0.537, HyperFrames 0.8.180, and command (shell
  templates, quoted paths on Windows).
- **Rendering**: motion blur on native sequences averages the sub-frames inside the shutter,
  centred on the frame (fixed after the four-engine parity sheet showed ghosted readouts); long
  motion-blurred masters work on HyperFrames (one near-lossless video instead of ~60 GB of PNGs)
  and Remotion (sub-frames through `thesium.renderFps`); disk space is checked before any native
  image sequence.
- **Sound**: scores and SFX in code, beat tracking, checks, mastering to −14 LUFS / −1 dBTP with a
  true-peak guard and an end fade. **Narration**: timed lines spoken locally (Kokoro, the system
  voice, any TTS command, recorded takes), transcribed with faster-whisper and checked word by word
  (characters for Chinese and Japanese), music ducked automatically to 10 LU under the voice, and
  master QA that measures the balance and listens to the mix. Measured per language: English,
  Spanish, French, Italian and Brazilian Portuguese are heard back at 92–100%; Kokoro's Hindi,
  Japanese and Mandarin are not usable through kokoro-onnx (64%, 18%, 33%), and Thesium warns.
  The hearing check decodes with FFmpeg and hands Whisper samples: PyAV 19.0 broke
  faster-whisper's own decoder, so every fresh install had a crashing hearing check.
- **Examples**: the launch film on EffectCraft, web, HyperFrames and Remotion (one plan, four
  engines, `docs/media/parity-sheet.jpg`), and a narrated film drawn from the hearing check.
- **EffectCraft**: every limit re-verified with minimal scripts (`docs/upstream/effectcraft/`).
  Two bugs and two feature requests hold up and are drafted; three effects earlier listed as broken
  work, and the guide is corrected.
- **Linux and Omarchy**: verified on Arch Linux (Omarchy's base) as Omarchy sets it up, as a
  normal user: Node 26, FFmpeg 9, Chromium 155 and Python 3.14; the web, EffectCraft (its Linux
  `.tar.gz`), Remotion and HyperFrames engines; Kokoro narration. Arch's Python has no pip and
  refuses installs (PEP 668), so Thesium uses its own `~/.thesium/venv` when it exists and every
  install hint gives the venv command there; the `"system"` voice on Linux needs espeak-ng, which
  `doctor` now checks.
- **Docs**: a visual guide (`docs/GUIDE.md`) with nine figures rendered from HTML by Thesium's own
  Chrome client (`docs/figures/`), a new README, and this blueprint.
- **Tests**: 20 (core, frame check, QR, MCP, motion-blur sampling, end-to-end web, command,
  EffectCraft and Remotion films, a motion-blurred native sequence, narration, the Python lookup).
  CI runs them on Linux with Node 22 and 24 on every push, and on Windows, macOS and Arch Linux
  (with EffectCraft and Remotion, `.github/arch.sh`) weekly, on tags and on demand.

## Decisions worth remembering

- CLI-Anything (HKUDS) was considered and not adopted as a dependency; its CLIs fit the command
  engine (BLUEPRINT section 6).
- Whisper alone cannot judge a mix: it heard every word with the music 7.7 LU louder than the
  voice, so narration QA measures the balance too.
- Test claims in isolation before acting on them: three EffectCraft "broken effects" were not.

## Waiting on the owner

- Filing the EffectCraft reports in `docs/upstream/effectcraft/ISSUES.md` (needs a go-ahead).

## Next

Ideas in the [roadmap](BLUEPRINT.md#18-roadmap).
