#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
node scripts/check-v051-wave-a-rollback.mjs
