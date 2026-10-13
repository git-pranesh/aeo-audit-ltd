#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Dependencies are managed by the Replit workspace. Avoid reinstalling the
# entire lockfile here: npm ci currently attempts to download a blocked,
# deprecated transitive package even when the installed tree is usable.
# The production build below still fails fast if a merged dependency is
# genuinely unavailable.
npm run build