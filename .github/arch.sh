#!/bin/bash
# The Arch Linux job, run inside archlinux:latest with the repository mounted at /src:
#   docker run --rm --security-opt seccomp=unconfined -v "$PWD:/src:ro" archlinux:latest bash /src/.github/arch.sh
# Arch is the base of Omarchy, and rolling: the newest Node, FFmpeg, Chromium and Python. Packages
# come from pacman as on an Omarchy machine, the tests run as a normal user (Chromium's sandbox
# refuses root), and EffectCraft and Remotion are installed so their films are tested too.
set -euo pipefail
EFFECTCRAFT=0.11.1

if [ "$(id -u)" = 0 ]; then
  pacman -Syu --noconfirm --needed nodejs npm ffmpeg chromium python python-numpy python-scipy espeak-ng curl >/dev/null
  useradd -m dev
  exec su dev -c "bash $0"
fi

cp -r /src ~/thesium
rm -rf ~/thesium/node_modules
cd ~/thesium

curl -fsSL "https://github.com/storytold/effectcraft/releases/download/v$EFFECTCRAFT/effectcraft-$EFFECTCRAFT-linux-x86_64.tar.gz" | tar -xz -C ~
mkdir -p ~/.local/bin
ln -s ~/effectcraft-$EFFECTCRAFT-linux-x86_64/bin/effectcraft-cli ~/.local/bin/effectcraft-cli
export PATH="$HOME/.local/bin:$PATH"

mkdir ~/remotion
(cd ~/remotion && npm init -y >/dev/null && npm install --no-audit --no-fund remotion @remotion/cli react react-dom >/dev/null)
export THESIUM_TEST_REMOTION="$HOME/remotion/node_modules"

npm ci --no-audit --no-fund
node cli/thesium.js doctor || true
npm run check
