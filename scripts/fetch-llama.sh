#!/usr/bin/env bash
# Downloads the pinned llama.cpp release used by the on-device Writex AI engine.
set -euo pipefail
TAG="${LLAMA_CPP_TAG:-b4600}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/android/app/src/main/cpp/llama.cpp"
if [ -f "$DEST/CMakeLists.txt" ] && [ "$(cat "$DEST/.writex-tag" 2>/dev/null)" = "$TAG" ]; then echo "llama.cpp $TAG already present"; exit 0; fi
rm -rf "$DEST"
git clone --depth 1 --branch "$TAG" https://github.com/ggml-org/llama.cpp "$DEST"
echo "$TAG" > "$DEST/.writex-tag"
echo "llama.cpp $TAG ready in $DEST"
