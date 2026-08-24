#!/usr/bin/env bash
# M0-03: dev startup script (Linux/macOS)
set -e

cd "$(dirname "$0")/.."

echo "==> 启动 PostgreSQL + Redis ..."
docker compose up -d postgres redis

echo "==> 等待数据库健康检查通过 ..."
until docker compose exec -T postgres pg_isready -U "${DB_USER:-postgres}" -d "${DB_NAME:-hrms}" >/dev/null 2>&1; do
  sleep 1
done
echo "==> PostgreSQL 就绪"

echo "==> 等待 Redis 就绪 ..."
until docker compose exec -T redis redis-cli ping >/dev/null 2>&1; do
  sleep 1
done
echo "==> Redis 就绪"

echo ""
echo "✅ 基础设施已启动"
echo "   PostgreSQL: localhost:${DB_PORT:-5432}  (db=${DB_NAME:-hrms})"
echo "   Redis:      localhost:${REDIS_PORT:-6379}"
echo ""
echo "下一步："
echo "  1) pnpm install                       # 首次需要"
echo "  2) pnpm --filter hrms-server db:migrate && pnpm --filter hrms-server db:seed"
echo "  3) pnpm dev                           # 启动 server + client"
