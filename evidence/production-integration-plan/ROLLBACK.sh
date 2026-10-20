#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
node evidence/production-integration-plan/CHECK.mjs rollback
