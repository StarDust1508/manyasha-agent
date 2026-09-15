#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PACKAGE_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
OUTPUT_DIR=${1:-"$PACKAGE_ROOT/dist"}
STAGE_DIR="$OUTPUT_DIR/Manyasha-0.1.0-macos"
ARCHIVE="$OUTPUT_DIR/Manyasha-0.1.0-macos.zip"

case "$OUTPUT_DIR" in ""|"/"|"$HOME") echo "Отказ: небезопасная папка выпуска" >&2; exit 3 ;; esac
mkdir -p "$OUTPUT_DIR"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/src" "$STAGE_DIR/scripts" "$STAGE_DIR/bin" "$STAGE_DIR/config" "$STAGE_DIR/docs" "$STAGE_DIR/runtime-assets/hermes-web"
cp "$PACKAGE_ROOT/src/cli.mjs" "$PACKAGE_ROOT/src/core.mjs" "$PACKAGE_ROOT/src/gui.mjs" "$STAGE_DIR/src/"
cp "$PACKAGE_ROOT/scripts/navy-key.mjs" "$PACKAGE_ROOT/scripts/pinned-hermes.mjs" "$PACKAGE_ROOT/scripts/install-macos.sh" "$STAGE_DIR/scripts/"
cp "$PACKAGE_ROOT/bin/manyasha" "$PACKAGE_ROOT/bin/manyasha-hermes" "$STAGE_DIR/bin/"
cp "$PACKAGE_ROOT/config/hermes-config.yaml" "$STAGE_DIR/config/"
cp "$PACKAGE_ROOT/package.json" "$PACKAGE_ROOT/upstream.lock.json" "$PACKAGE_ROOT/README.md" "$PACKAGE_ROOT/THIRD_PARTY_NOTICES.md" "$PACKAGE_ROOT/SECURITY.md" "$STAGE_DIR/"
cp -R "$PACKAGE_ROOT/docs/." "$STAGE_DIR/docs/"
test -f "$PACKAGE_ROOT/vendor/hermes-agent/hermes_cli/web_dist/index.html" || { echo "Сначала соберите проверенный Hermes Web UI" >&2; exit 7; }
cp -R "$PACKAGE_ROOT/vendor/hermes-agent/hermes_cli/web_dist/." "$STAGE_DIR/runtime-assets/hermes-web/"
chmod 0755 "$STAGE_DIR/scripts/install-macos.sh" "$STAGE_DIR/bin/manyasha" "$STAGE_DIR/bin/manyasha-hermes"
rm -f "$ARCHIVE"
(cd "$OUTPUT_DIR" && /usr/bin/zip -qry "$(basename "$ARCHIVE")" "$(basename "$STAGE_DIR")")
shasum -a 256 "$ARCHIVE" > "$ARCHIVE.sha256"
printf '%s\n' "$ARCHIVE"
