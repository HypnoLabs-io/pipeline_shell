#!/usr/bin/env bash
# Install the ffmpeg 8.0.1 build HyperFrames tests against: the BtbN static build pinned in
# HyperFrames' render Dockerfile. No sudo. Ubuntu's ffmpeg in /usr/bin is left alone.
#
#   bash tools/install-ffmpeg.sh          install to ~/.local/opt/ffmpeg/<build>/bin only
#   bash tools/install-ffmpeg.sh --link   also link ffmpeg + ffprobe into ~/.local/bin,
#                                         which is ahead of /usr/bin on PATH (all projects)
#
# Undo the link with: rm ~/.local/bin/ffmpeg ~/.local/bin/ffprobe
set -euo pipefail

if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo "this script installs the Linux x86_64 build only; install ffmpeg from your package manager instead" >&2
  exit 1
fi

BUILD=n8.0.1-66-g27b8d1a017
URL="https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-02-28-12-59/ffmpeg-$BUILD-linux64-gpl-8.0.tar.xz"
SHA=26d2ecd0cefba99f9d1ea92252a3a4f743a58df4c1c3cf9f8bbaaa40b1fca5b0
DEST="$HOME/.local/opt/ffmpeg/$BUILD/bin"

if [[ -x "$DEST/ffmpeg" && -x "$DEST/ffprobe" ]]; then
  echo "already installed in $DEST"
else
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  echo "downloading $BUILD ..."
  curl -fsSL -o "$tmp/ffmpeg.tar.xz" "$URL"
  echo "$SHA  $tmp/ffmpeg.tar.xz" | sha256sum -c -
  mkdir -p "$DEST"
  tar -xJf "$tmp/ffmpeg.tar.xz" -C "$DEST" --strip-components=2 --wildcards '*/bin/ffmpeg' '*/bin/ffprobe'
  echo "installed to $DEST"
fi

if [[ "${1:-}" == "--link" ]]; then
  mkdir -p "$HOME/.local/bin"
  for bin in ffmpeg ffprobe; do
    link="$HOME/.local/bin/$bin"
    if [[ -e "$link" || -L "$link" ]]; then
      echo "skipping $link: something is already there ($(readlink -f "$link"))"
    else
      ln -s "$DEST/$bin" "$link"
      echo "linked $link"
    fi
  done
  hash -r
  echo "now on PATH: $(command -v ffmpeg)"
fi

"$DEST/ffmpeg" -version | head -1
