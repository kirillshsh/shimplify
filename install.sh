#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]:-}"
if [[ -n "$SCRIPT_PATH" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
else
  SCRIPT_DIR=""
fi

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
cyan() { printf '\033[36m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }
red() { printf '\033[31m%s\033[0m\n' "$1"; }

printf '\n'
cyan "Codex shimplify Installer"
cyan "========================"

if [[ -n "$SCRIPT_DIR" && -f "$SCRIPT_DIR/bin/install.mjs" ]]; then
  if ! command -v node >/dev/null 2>&1; then
    red "Node.js 18+ is required for local install."
    red "Install Node.js from https://nodejs.org/ and retry."
    exit 1
  fi

  bold "› Running local installer"
  node "$SCRIPT_DIR/bin/install.mjs" "$@"
  exit 0
fi

if ! command -v npx >/dev/null 2>&1; then
  red "npx was not found."
  red "Install Node.js 18+ from https://nodejs.org/ and retry."
  exit 1
fi

PACKAGE_SPEC="${SHIMPLIFY_PACKAGE:-github:kirillshsh/shimplify}"
bold "› Fetching installer package with npx"
green "✓ Package: $PACKAGE_SPEC"
npx --yes "$PACKAGE_SPEC" "$@"
