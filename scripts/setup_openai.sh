#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

printf "scripts/setup_openai.sh is deprecated. Use scripts/setup_model.sh instead.\n" >&2
exec "$SCRIPT_DIR/setup_model.sh" "$@"
