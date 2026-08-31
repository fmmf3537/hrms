#!/usr/bin/env bash
# M5-1: 一键部署脚本（bash / Linux / macOS）
# 前置：docker + docker-compose 已安装
# 用法：cp .env.production .env && ./deploy.sh

set -e

echo "===== HRMS 一键部署（生产环境）====="

# 1. 检查依赖
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Docker 未安装"
  exit 1
fi
if ! command -v docker-compose >/dev/null 2>&1 && ! docker compose version >/dev/null 2>&1; then
  echo "❌ Docker Compose 未安装"
  exit 1
fi

# 2. 检查 .env
if [ ! -f .env ]; then
  if [ -f .env.production ]; then
    echo "⚠️  .env 不存在，从 .env.production 复制"
    cp .env.production .env
  else
    echo "❌ .env 和 .env.production 都不存在"
    exit 1
  fi
fi

# 3. 加载环境变量
set -a
# shellcheck disable=SC1091
source .env
set +a

# 4. 检查必填变量
for var in JWT_SECRET JWT_REFRESH_SECRET ENCRYPTION_KEY DB_USER DB_PASSWORD DB_NAME; do
  if [ -z "${!var}" ]; then
    echo "❌ $var 未设置"
    exit 1
  fi
done

# 5. 停止旧容器
echo "🔄 停止旧容器..."
docker-compose down --remove-orphans 2>/dev/null || docker compose down --remove-orphans 2>/dev/null || true

# 6. 构建新镜像
echo "🔨 构建新镜像..."
docker-compose build --no-cache || docker compose build --no-cache

# 7. 启动服务
echo "🚀 启动服务..."
docker-compose up -d || docker compose up -d

# 8. 等待健康检查
echo "⏳ 等待服务健康检查..."
sleep 30

# 9. 显示服务状态
echo "📊 服务状态："
docker-compose ps || docker compose ps

# 10. 显示日志
echo "📝 服务日志（Ctrl+C 退出）："
docker-compose logs -f server client || docker compose logs -f server client
