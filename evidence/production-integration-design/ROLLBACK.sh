#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
node evidence/production-integration-design/CHECK.mjs rollback
