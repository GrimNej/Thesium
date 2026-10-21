<p align="center">
  <img src="docs/figures/banner.png" alt="Thesium: the model directs, any engine renders" width="100%">
</p>

<p align="center">
  <b>An engine-agnostic motion studio for frontier models.</b><br>
  You describe a film. The model directs it in code, looks at every frame, fixes what it sees,<br>
  and Thesium masters it on whichever engine you choose.
</p>

<p align="center">
  <a href="https://github.com/GrimNej/Thesium/actions/workflows/test.yml"><img alt="tests" src="https://github.com/GrimNej/Thesium/actions/workflows/test.yml/badge.svg"></a>
  <a href="https://github.com/GrimNej/Thesium/releases"><img alt="version 1.0.0" src="https://img.shields.io/badge/version-1.0.0-6fe7f2?style=flat-square"></a>
  <a href="LICENSE"><img alt="license MIT" src="https://img.shields.io/badge/license-MIT-f3efe6?style=flat-square"></a>
  <img alt="node ≥ 22.12" src="https://img.shields.io/badge/node-%E2%89%A5%2022.12-339933?style=flat-square&logo=nodedotjs&logoColor=white">
  <img alt="runtime dependencies 0" src="https://img.shields.io/badge/runtime%20dependencies-0-6fe7f2?style=flat-square">
  <img alt="platforms Windows · macOS · Linux" src="https://img.shields.io/badge/platforms-Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-22344b?style=flat-square">
</p>

<p align="center">
  <a href="https://claude.com/claude-code"><img alt="Claude Code" src="https://img.shields.io/badge/Claude%20Code-D97757?style=for-the-badge&logo=claude&logoColor=white"></a>
  <a href="https://modelcontextprotocol.io"><img alt="MCP" src="https://img.shields.io/badge/MCP-1f2937?style=for-the-badge&logo=modelcontextprotocol&logoColor=white"></a>
  <a href="https://nodejs.org"><img alt="Node.js" src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white"></a>
  <a href="https://ffmpeg.org"><img alt="FFmpeg" src="https://img.shields.io/badge/FFmpeg-007808?style=for-the-badge&logo=ffmpeg&logoColor=white"></a>
  <a href="https://www.chromium.org"><img alt="Chromium" src="https://img.shields.io/badge/Chromium-1a73e8?style=for-the-badge&logo=googlechrome&logoColor=white"></a>
  <a href="https://www.python.org"><img alt="Python" src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=ffd43b"></a>
  <a href="https://huggingface.co/hexgrad/Kokoro-82M"><img alt="Kokoro TTS" src="https://img.shields.io/badge/Kokoro%20TTS-ff9d00?style=for-the-badge&logo=huggingface&logoColor=white"></a>
  <a href="https://github.com/SYSTRAN/faster-whisper"><img alt="Whisper" src="https://img.shields.io/badge/Whisper-10a37f?style=for-the-badge"></a>
</p>

<p align="center">
  <a href="knowledge/engines/web.md"><img alt="Web" src="https://img.shields.io/badge/Web-1d2f48?style=for-the-badge&logo=googlechrome&logoColor=8ab4f8"></a>
  <a href="https://github.com/storytold/effectcraft"><img alt="EffectCraft" src="https://img.shields.io/badge/EffectCraft-1d2f48?style=for-the-badge&logo=data%3Aimage%2Fpng%3Bbase64%2CiVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAGiklEQVR4nLxXf0xVZRh%2B7rmgoPwQUH7eq4gKIpIbCoqV2dIpJmxqWHOtrabptKXi7J%2B03dW0VZtm02YTsj%2ByNUm32JBZOVumIKgpKgaGyI97%2BSWg3JEIXm7f893z3Q7BRVeudzs753zfOd%2Fzvs%2F7vO93jh8MVjv704ma2b1Jg2mZG%2B4kMeSPJ2P9JpiqB%2BA%2BMeAyHZhycUuDmjCpi9sZe9eK0%2BdPENSnM%2BLYGF%2B%2BNZ83mgH80P8ADi1yDDEO6ZgwkXaz2f3HfwX%2FLakHF0Y5sO7qNJ%2FP3MkKR0VfPbJOBfO23%2BUyTdWY838D3hzSKw%2FaodSbKNKqYAry9%2FlsyQtOvPrtLkRd61PD%2FlJvFBwe07jQkvYDyM%2B8jaLAGlxO74ctvgxP5yxAadmFQc8pa00AKleMhsPUjd2Jq5HWGuGdI7afrvYRQS%2FFdsESNgEVaIHVbcHe%2FAJYLbFAzVmU%2FnICee%2B8J5%2FNfXEZil1nYLaMRcxxIGBNEgKfDULZZwcx%2B17kIHAasSlCn%2FTT%2BxMZHZi8Kg0tiWbY77Zjz8fvo%2FCbfFiEAzwamxwy%2Bq1vb8C2jz6EX3I4Ss9dkJRfmtyNvQI8uzMByx2ThoPwNwk1un05ULDIjtLzHmoz587xXlt1YDVuiYuVY3sEmLpvsjvkEd05Gutbn%2FIF4SnD4exK5kMvoLImAcqD4GQhd2WOBCSQMvUOzwOOnhHBfTpQPL0ZjjH3ZVRNeqR79h30Rs000MrKPWB5mzfI8z8dytu%2BEY%2ByISn4IqoSLeEPJBgXk5HrC5La3FU5XhaMqVj9Uo53DTpLBjj%2Fpj0VMd0BPh0wb4lbajMOFE9swLyMOVi6%2BHkPAwL8%2Bo1qpCQnSXCpfkYvAAja3e1EwVdHKGl5bdXFGRIcjIaKm8junorHZoDU%2B82NlsqVEYuFFAs8q2ilA4J%2BlQpWQeHxInlW75Ct6BoXZpX6jejAoNmK3no0HS%2BXizASMkEGuCABWGrSmQXLZP0rh%2Fg880%2FjmHon4kwzHmWDHIgLjoB1qtVbcgSVEYprBaCM0dLJzHm6TgQwHeTY0e%2BK5PjZu78i6kDXiA54NSB2KdF4TLjhqJO5pJC4Vy8RWqDK54sFOU7g0FC5mUgNMOLQEM%2B9EiXPJ384jZlpKfip%2FRoS7WN8OiDL8FJUB0qyeqBZgiTtZEBFJ8tKp9qqp6bRUJrKlDgVG3SOY6%2BsXy07qi%2BTKTCnRQrh7feKitRT8YXHirylZzQuzLmjohmp5qQaEJ8nuBIkrT0rzGcqpAPnq6%2FKGy7CgwsyekYq26pOq9rxOMZ5VS2KkTyhAW%2BLFvPUgmKi9tZZjC%2FpHOKA1EBz4J%2BY9FyyBOciISKnrH2THi0XU3lOmZEkI2MfIECwORD2thbYdmyXzKmuqLRA3fDdalcbGmvqEdMzWA9SA9ypSKmMzlD7RjN2PjJBcNqmCQtx2Pq63Ig4nrtmrbdCaGSPWuG65oTQ4RngF41zwPMRUXD4CE7%2BeFqywGjJBMeUc1yY49QFu%2BMpeyWyW%2BORHhAPLXosHP135RyrYL6eJtVJ63%2B%2BgUTnuMEOvJy80Lb7yjHMnDkdVVXVkm7WvNPplLkmpTxX%2FV4Na5xHfColdDLzmQzsvliI7I4EzOmJQixCsev01%2FL962I9PmMSubR98An2Ba4YysDO8ctti6JScTGkzZNj4Wm3eJlHvoicQARX7LAHXNcd5Zycr6uFkC5md01ArCsY1slW9Fj8JfVWayzc913YP%2F01BA1TCEzBu8EP%2FMxh06JQ3nZT5l9uLsJI4YxkzxcbI7Ht3C7FR%2Bfu3XPKVNDojBYWIL6KmzGtbjRiOkbB0duFxVPSJDNMUdDwVdiv8Y%2BFVwOdD7wNSAlNlZ2qca9Q9S8e4zcC9cEPz2ubwmTjobB5jLQVE1vj7xLbcEV%2FvRykmtXerpSfp29CBJaOsVfoDhgdpV60cQEIeGMGHseILX9MvrRU1mkp4RoXZSuWnVAIkecmwxasTDUpVW5Uvap%2F5Xhd0WXMKnGNhO%2F5MeGP4rq%2B9M0Pr3bIUYKyJcuPSgO4xfJ3S1bAfI7tWLbrNWsHseYv2ntbeuBIDmwktvfn9Fya7a1ia8M%2Bx7heTUWnTDWVRn2TadT7P7dfsmHUjfHTrOFKLUJ3VA2JHIafU5NxhunwiwncdllzrCwf0xwnfhxM9o42xEVEIm58FOx3WjE3KRVNHZ6StYhxeRZzvC4Te4q6Vs%2F0fX%2BLQvT5e%2F4XAAAA%2F%2F8dw%2BtsAAAABklEQVQDANrNaXMbz8foAAAAAElFTkSuQmCC"></a>
  <a href="https://www.remotion.dev"><img alt="Remotion" src="https://img.shields.io/badge/Remotion-1d2f48?style=for-the-badge&logo=data%3Aimage%2Fpng%3Bbase64%2CiVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADn0lEQVR4nKxXzW7TQBCe3bWdxE3alIYGEBUCTvTQt%2BgrcKrEQyBAgksuIAHiIZB64hX6Fr1wAoSKQBFNWxEnaRzvLjt2drNx7cT5%2BaQo9tqz882PZ2YdyEJLejWvW%2BOSedQTnIwkZyHnVzAIoXWvD2sESS%2FUW5f10PUqs4SQVFlcD84HjSG0SAhrI9D67fvu1hYsAEPm1e0uLIEpAtWP3V0RUjalgF%2FfEkoNBfWEOGFEnQByiAS9brBoiCYEMqxnkj8WhG7cEBLRiBMSuBIu04QSItWroqGh%2BqIOFa%2BIcoSkjksJ2%2BaUPaJi9AR4eEc%2FQw%2F6bn%2Bn8f5vDRYhEG04hkDs9hzlWWQIc3eRCMrp9X7kVzGk8EWyWfImBP7b3l2zqYz20ELrvQO1%2BFz9N9WvrX6nQMhp%2FJ%2FcTzZU4YlI6RslIg7BvNxICKjvHt2mF9EatGx821TKP0M%2BkMwxJGQMCZC8LVj5YkIiOy%2FGIfjj2IuWcnTHEcwGeueD5aFEnrCmzg3Mi%2BpGUM8KR0zATkA7jgviMCYCcKRJYG5MkfgZ7KRJ0AIbH0BxNMceM16jhGxrowyJNAHuMcMKi86NTReFRUKHwxFRVZPAcj9FQCpnGVlK3ZWU55AQIPf0o7jXqMJnCMzAIu7PInEIdmJaBavmVSuGgF3%2FHSAerA%2Bo3BjBKDPFTXt9ngeWD0EGIpCmDmiji3wFq8IUKCainr72RuGgCIFTWAWEvIRxqY5LNPVN54ynK00AS6V%2BYLtpReWfwDKAAjnT%2FYERbka7mADOfEZOiJG1TRuWU4694UTfMsG%2F67kBje2%2B3uzoZ3EPwIGTu2zMVIQSlkY7bTnhw18RKxvlwYNqxxaIPeBUIuMBHLumNiyeB9gVn0FKue6IiLgjPiXcFnLSu4TECxlY76A7kyaTjYm7Tbgw4TDm2nJEf%2BR3stpxTADHazUPxLVaJ0rKsmOrqqGbTyCx9IZ3hOSXhLpnYnw%2Fb0Z0shapFL3USHY8tjQX2mppDamY7d0Xm51Zckkd2IepuIzAPYOCQMWY5YK6X%2B0J2Xf6gZ3tufL6ovbu3w4exQwz1cMlK93PUkgIDbngPUHLF%2BmQmUxPJVseTAi6YTBQ5wJDALNXSBo4ol%2FVM4JDaBBRN7FSjRDqk51WjMPnm2UPJmpUwmklfTKaB6zpV%2Fv1blGL8wkUJIGWOr0oxNpx%2FrDRX1ZxNoExicaPc3%2FIS57u2ViqS2wYruM0nMZ%2FAAAA%2F%2F%2FBAD7tAAAABklEQVQDADJZ408cHbJVAAAAAElFTkSuQmCC"></a>
  <a href="https://github.com/heygen-com/hyperframes"><img alt="HyperFrames" src="https://img.shields.io/badge/HyperFrames-1d2f48?style=for-the-badge&logo=data%3Aimage%2Fpng%3Bbase64%2CiVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADBUlEQVR4nOxWMW%2FTUBC%2Be3FCmlYVEkXq0sahDVI32Fig7oBUsdBfQBKJoSMSK1ISiYWVBbakiJEhE7CguALBBmJiSKndBgnYkKBuWj%2F7ODtxGjtJmyKhLjnp%2FO7O9t13d8%2F3LOCMScAZ0xjAGMAYgAL%2FQMnmbw0Ic4CggowVWpkJ07OvNfIakVsBJBOByrXsc%2F0kXwinoPPN7xwAiwSotV9FcBHKf%2BYullaNdTXu2IYgyXYKnJdBimptqWoO8zlSC2aaDW1mt1FXXKuu0J4Wpz1QPIY9SLiW%2F4zjJDUbUmDDBDiQYAjCg1GkmFtf%2B5JXh%2Fk%2BtgWzxidVCCyCa%2BWpkzH14OZqALpY9QHglEocHkFCjBlZbq9SFYo01hp3yqBwNTLhagytwLzxrnIOLYMzzStBxn1smT8yS77DQ0otH3YqcMjsVSPQPZYQL5KkSrQafXvgsvGqRCiK4YwDGXtkvqKobqdvFK4ZT1SgA0NwGEE2%2BGvAA3QF7JVatqr3tWDJeFEHsLwdPjBg1MbP7XjWFiTVGLtvB4l3VnuwjnHeI3aFX8uEAFwxNkoE%2B1rQmWjAo8DQldmqe7qElEYYDdzmYC9EdDWI2wUQc600Ym9AGFAF7HaOZfPzpZwPgHu87LCrYRVwenViHaXZB%2BAcWDsEUQAilHGvndeuE4kp7SjrSM%2BjOgeP4UGhD8D7hful618fplnMA5xcCb5uendmjQ%2Bq7X%2F1IwAgWf24cLcb%2FCjFDr1deFCIk1WIg2UyQ5v3fU6wnOjYfNlt6W0P03mJk14VOjwJUd3GSZ3XlWhwgCGjeNW4pzoSeaa3R26k9%2F76ZvGRb7ywu11Hkn4L%2FMET%2BuxsXSG7vJW5qcMQOvYsuNVYLzGIHD%2BmRvaG%2BXrxsf8ZTe%2F%2BpFCpye%2Bzrjh2%2BVvmqg4n0LGj%2BGX2aYlPON0l8qqhdgcQ4IZ3P2nsc%2F9DvTZROIVfc3M6jEgjn4a3t3Le8NCQaKOWfVYK7ImmzVVy08K1N1vzU1U4JZ3qOP4fNP4lGwMYAzhzAH8BAAD%2F%2FxuUv8gAAAAGSURBVAMAFAeJxBoemIgAAAAASUVORK5CYII%3D"></a>
  <a href="knowledge/engines/command.md"><img alt="Any CLI" src="https://img.shields.io/badge/Any%20CLI-1d2f48?style=for-the-badge&logo=gnubash&logoColor=6fe7f2"></a>
</p>

<p align="center">
  <a href="#quick-start"><b>Quick start</b></a> ·
  <a href="docs/GUIDE.md"><b>Guide</b></a> ·
  <a href="#made-with-thesium"><b>Films</b></a> ·
  <a href="#how-it-works"><b>How it works</b></a> ·
  <a href="docs/BLUEPRINT.md"><b>Blueprint</b></a>
</p>

---

## Made with Thesium

<table>
  <tr>
    <td width="50%"><a href="docs/media/thesium-launch-effectcraft.mp4"><img src="docs/media/launch.webp" alt="Thesium, a 30-second launch film made on EffectCraft"></a></td>
    <td width="50%"><a href="docs/media/thesium-voice.mp4"><img src="docs/media/voice.webp" alt="Hears every word, a 24-second narrated film"></a></td>
  </tr>
  <tr>
    <td><b>Thesium</b>: a 30-second launch film on EffectCraft. Fractal fog, a playhead through every shot, a lit 3D wall of real renders, liquid type and an original score.<br><a href="docs/media/thesium-launch-effectcraft.mp4">Watch</a> · <a href="examples/thesium-launch/">Source and making-of</a></td>
    <td><b>Hears every word</b>: a 24-second narrated film, drawn from Thesium's own check of its voice-over. Every word heard, the music stepping aside.<br><a href="docs/media/thesium-voice.mp4">Watch</a> · <a href="examples/thesium-voice/">Source and making-of</a></td>
  </tr>
</table>

<p align="center">
  <a href="examples/thesium-launch-web/#comparison"><img src="docs/media/parity.webp" alt="The same film rendered by EffectCraft, the web engine, HyperFrames and Remotion" width="100%"></a>
  <br><b>One film, four engines.</b> The launch film made again on the web engine, HyperFrames and Remotion from the same plan, assets and score.
  <a href="examples/thesium-launch-web/#comparison">Compare them</a>.
</p>

## Quick start

You need [Node.js](https://nodejs.org) 22.12+, [FFmpeg](https://ffmpeg.org/download.html) and Chrome (or Edge, or Chromium). Then, in [Claude Code](https://claude.com/claude-code):

```
/plugin marketplace add GrimNej/Thesium
/plugin install thesium@thesium
```

and ask for a film:

> Make a 20-second launch film for https://example.com, warm and cinematic, in EffectCraft.

Or from any terminal:

```
git clone https://github.com/GrimNej/Thesium && cd Thesium && npm link
thesium doctor                                   # checks your machine, says how to fix anything missing
thesium make "a 20-second launch film for https://example.com" --engine effectcraft
```

The model plans, builds, checks, scores and masters the film on its own, has an independent critic review it, and makes a polish pass. In testing, `thesium make` built a 12-second promo from a public website this way in about 45 minutes. Then open the review studio in the film's folder with `node thesium.mjs studio`, pin notes on the timeline, and hand them back. **The [guide](docs/GUIDE.md) walks through all of it, with pictures.**

## How it works

<p align="center"><img src="docs/figures/how-it-works.png" alt="How Thesium works: you ask, the model directs, Thesium is the studio, any engine draws each frame" width="100%"></p>

Thesium asks one thing of a renderer: **draw the frame at time `t`**. Everything else is the same on every engine:

| Sense | What Thesium gives the model |
| --- | --- |
| **Eyes** | exact stills with the master's motion blur, strips across cuts, phone-size copies, contact sheets, quick previews |
| **Ears** | original scores and sound effects written in code, beat tracking, loudness and spectrum checks |
| **Voice** | narration spoken locally, then transcribed and checked word by word; the music steps aside for it |
| **Gate** | rule checks, a same-frame-twice test, an automatic frame check, master QA, an independent critic |
| **Material** | web pages captured with their sources, real QR codes, frame-accurate video clips |
| **Finish** | full-quality render, sound mixed to −14 LUFS, review sheets |
| **You** | a local review studio: watch any version, pin notes to frames, tune what the film exposes |

## Engines

| Engine | The film is | Best for |
| --- | --- | --- |
| **Web** | a page with `window.render(t)` | anything a browser draws: WebGL, canvas, CSS 3D, SVG, video |
| **[EffectCraft](https://github.com/storytold/effectcraft)** | an After Effects-style script | classic motion design: effects, glows, lights, text animators |
| **[Remotion](https://www.remotion.dev)** | a React project | long films from reusable components and data |
| **[HyperFrames](https://github.com/heygen-com/hyperframes)** | HTML with a GSAP timeline | timeline choreography and HyperFrames' building blocks |
| **Any CLI** | commands in `thesium.json` | Blender, Manim, Motion Canvas, your own renderer |

Thesium calls each engine's own tools and bundles none of them. [Choosing an engine](docs/GUIDE.md#4-choose-an-engine) has the details.

## Documentation

| Read | For |
| --- | --- |
| [**Guide**](docs/GUIDE.md) | installing, your first film, notes, engines, sound and narration, troubleshooting |
| [Blueprint](docs/BLUEPRINT.md) | how Thesium is built and why, with measurements |
| [Engine guides](knowledge/engines/) | how a film is written for each engine, with tested recipes |
| [Motion Library](knowledge/README.md) | the director's craft: direction, review, sound, video types, style bibles |
| [Examples](examples/) | five films with their sources and what making them taught Thesium |
| [Build log](docs/PROGRESS.md) | what was built and verified |

<details>
<summary><b>Repository layout</b></summary>

```
cli/            the thesium command
src/core/       manifest (thesium.json), film workspaces, paths, disk checks
src/engines/    web, effectcraft, remotion, hyperframes, command: the engine contract
src/render/     stills, strips, motion blur and videos on any engine
src/media/      FFmpeg: sheets, encoding, mixing, ducking, mastering
src/review/     frame check, language check
src/studio/     everything the CLI, MCP server and review studio share, narration included
src/mcp/        the MCP server
kit/            copied into every film: web motion kit, EffectCraft kit, synth, voice
knowledge/      the Motion Library and a guide per engine
skills/ agents/ .claude-plugin/   the Claude Code plugin: director skill, critic, MCP
fonts/          OFL fonts (with fixed-weight instances for engines that need them)
docs/           guide, blueprint, figures and their sources, media, upstream reports
examples/       the films above, with their making-of
```

</details>

## Status

Version 1.0.0. All five engines are verified end to end, each with a master that passes QA, and the
films above were made with it. Tests run on every push on Linux (Node 22 and 24), and weekly on
Windows, macOS and Arch Linux (the base of Omarchy). Ideas for what comes next are in the [blueprint](docs/BLUEPRINT.md#18-roadmap).

## Credits

Thesium grew out of Vmotion. Its Motion Library adapts work by xilo (@xilo2991), Kianzzz
(xilo-opus-video, MIT), LemoLab (Lemo-Opuscar style bibles, MIT), athemeroy (CC BY 4.0),
yihui-dev (MIT) and makevoid (MIT); see [knowledge/THIRD_PARTY.md](knowledge/THIRD_PARTY.md).
QR codes come from Project Nayuki's QR Code generator (MIT). Fonts are SIL Open Font License 1.1
([fonts/README.md](fonts/README.md)). Narration uses Kokoro-82M (Apache-2.0) through kokoro-onnx
(MIT) and the hearing check faster-whisper (MIT), both installed by you and run locally. Icons in
the figures come from [Simple Icons](https://simpleicons.org) (CC0); product names and logos belong
to their owners. EffectCraft, Remotion and HyperFrames are separate projects under their own
licences; Thesium only calls them.

## License

[MIT](LICENSE)
