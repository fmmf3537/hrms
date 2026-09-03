#!/usr/bin/env bash
# ============================================================================
# HRMS pre-push 本地质量门（M5-11）
# 推送前跑：server/client lint + type-check + 单测。
# E2E 需 DB/Redis + 双服务，默认跳过（CI 的 e2e job 覆盖）；本地想跑：
#   bash scripts/git/pre-push.sh --with-e2e
# ============================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

echo "==> server lint"
pnpm --filter hrms-server lint
echo "==> server type-check"
pnpm --filter hrms-server type-check
echo "==> client lint"
pnpm --filter hrms-client lint
echo "==> client type-check"
pnpm --filter hrms-client type-check
echo "==> server unit tests"
pnpm --filter hrms-server test
echo "==> client unit tests"
pnpm --filter hrms-client test

if [[ "${1:-}" == "--with-e2e" ]]; then
  echo "==> E2E"
  pnpm test:e2e
fi

echo "✅ pre-push quality gate passed"
