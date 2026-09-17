#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PACKAGE_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
INSTALL_ROOT=${MANYASHA_INSTALL_PREFIX:-"$HOME/Library/Application Support/Manyasha/app"}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --prefix) INSTALL_ROOT=$2; shift 2 ;;
    *) echo "Неизвестный параметр: $1" >&2; exit 2 ;;
  esac
done

case "$INSTALL_ROOT" in
  ""|"/"|"$HOME") echo "Отказ: небезопасный путь установки" >&2; exit 3 ;;
esac

command -v node >/dev/null 2>&1 || { echo "Нужен Node.js 22 или новее" >&2; exit 4; }
command -v uv >/dev/null 2>&1 || { echo "Нужен uv для закреплённого Python-runtime" >&2; exit 4; }
command -v git >/dev/null 2>&1 || { echo "Нужен Git для получения закреплённой основы" >&2; exit 4; }

NODE_MAJOR=$(node -p 'Number(process.versions.node.split(".")[0])')
[ "$NODE_MAJOR" -ge 22 ] || { echo "Нужен Node.js 22 или новее" >&2; exit 4; }

mkdir -p "$INSTALL_ROOT/src" "$INSTALL_ROOT/scripts" "$INSTALL_ROOT/bin" "$INSTALL_ROOT/.runtime"
cp "$PACKAGE_ROOT/src/cli.mjs" "$PACKAGE_ROOT/src/core.mjs" "$PACKAGE_ROOT/src/gui.mjs" "$INSTALL_ROOT/src/"
cp "$PACKAGE_ROOT/scripts/navy-key.mjs" "$PACKAGE_ROOT/scripts/pinned-hermes.mjs" "$INSTALL_ROOT/scripts/"
cp "$PACKAGE_ROOT/bin/manyasha" "$PACKAGE_ROOT/bin/manyasha-hermes" "$INSTALL_ROOT/bin/"
cp "$PACKAGE_ROOT/package.json" "$PACKAGE_ROOT/upstream.lock.json" "$PACKAGE_ROOT/README.md" "$INSTALL_ROOT/"
chmod 0755 "$INSTALL_ROOT/bin/manyasha" "$INSTALL_ROOT/bin/manyasha-hermes"
# A ZIP downloaded by a browser can propagate macOS quarantine to copied shell
# wrappers. The user has explicitly invoked this installer, so clear the
# attribute only from the two installed launchers; source and provider files
# remain untouched.
if command -v xattr >/dev/null 2>&1; then
  xattr -d com.apple.quarantine "$INSTALL_ROOT/bin/manyasha" "$INSTALL_ROOT/bin/manyasha-hermes" 2>/dev/null || true
fi

if [ ! -x "$INSTALL_ROOT/.runtime/hermes-venv/bin/python" ]; then
  uv venv "$INSTALL_ROOT/.runtime/hermes-venv" --python 3.11
fi
HERMES_CHECKOUT="$INSTALL_ROOT/vendor/hermes-agent"
if [ ! -d "$HERMES_CHECKOUT/.git" ]; then
  if [ -e "$HERMES_CHECKOUT" ]; then
    echo "Отказ: путь основы занят неизвестными файлами" >&2
    exit 5
  fi
  mkdir -p "$INSTALL_ROOT/vendor"
  if [ -n "${MANYASHA_HERMES_SOURCE:-}" ]; then
    git clone --no-hardlinks "$MANYASHA_HERMES_SOURCE" "$HERMES_CHECKOUT"
  else
    git clone https://github.com/NousResearch/hermes-agent.git "$HERMES_CHECKOUT"
  fi
fi
git -C "$HERMES_CHECKOUT" checkout --detach 5eb99eb2844b22ebb723711b8e6a0bbb80bb5f04
[ "$(git -C "$HERMES_CHECKOUT" rev-parse HEAD)" = "5eb99eb2844b22ebb723711b8e6a0bbb80bb5f04" ] || { echo "Не совпал закреплённый commit Hermes" >&2; exit 6; }
if [ -f "$PACKAGE_ROOT/runtime-assets/hermes-web/index.html" ]; then
  mkdir -p "$HERMES_CHECKOUT/hermes_cli/web_dist"
  cp -R "$PACKAGE_ROOT/runtime-assets/hermes-web/." "$HERMES_CHECKOUT/hermes_cli/web_dist/"
fi
uv pip install --python "$INSTALL_ROOT/.runtime/hermes-venv/bin/python" -e "$HERMES_CHECKOUT"

DATA_ROOT=${MANYASHA_DATA_DIR:-"$HOME/Library/Application Support/Manyasha"}
mkdir -p "$DATA_ROOT/hermes-profile"
if [ ! -f "$DATA_ROOT/hermes-profile/config.yaml" ]; then
  cp "$PACKAGE_ROOT/config/hermes-config.yaml" "$DATA_ROOT/hermes-profile/config.yaml"
  chmod 0600 "$DATA_ROOT/hermes-profile/config.yaml"
fi

node "$INSTALL_ROOT/src/cli.mjs" setup
printf '%s\n' "Маняша установлена: $INSTALL_ROOT" "Команда: $INSTALL_ROOT/bin/manyasha" "Hermes TUI/GUI: $INSTALL_ROOT/bin/manyasha-hermes"
