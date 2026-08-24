# M0-03: dev startup script (Windows PowerShell)
$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "==> 启动 PostgreSQL + Redis ..." -ForegroundColor Cyan
docker compose up -d postgres redis

Write-Host "==> 等待数据库健康检查通过 ..." -ForegroundColor Cyan
$dbUser = if ($env:DB_USER) { $env:DB_USER } else { "postgres" }
$dbName = if ($env:DB_NAME) { $env:DB_NAME } else { "hrms" }
do {
  Start-Sleep -Seconds 1
  $ready = docker compose exec -T postgres pg_isready -U $dbUser -d $dbName 2>$null
} while ($LASTEXITCODE -ne 0)
Write-Host "==> PostgreSQL 就绪" -ForegroundColor Green

Write-Host "==> 等待 Redis 就绪 ..." -ForegroundColor Cyan
do {
  Start-Sleep -Seconds 1
  docker compose exec -T redis redis-cli ping 2>$null | Out-Null
} while ($LASTEXITCODE -ne 0)
Write-Host "==> Redis 就绪" -ForegroundColor Green

$dbPort = if ($env:DB_PORT) { $env:DB_PORT } else { "5432" }
$redisPort = if ($env:REDIS_PORT) { $env:REDIS_PORT } else { "6379" }

Write-Host ""
Write-Host "✅ 基础设施已启动" -ForegroundColor Green
Write-Host "   PostgreSQL: localhost:$dbPort  (db=$dbName)"
Write-Host "   Redis:      localhost:$redisPort"
Write-Host ""
Write-Host "下一步："
Write-Host "  1) pnpm install"
Write-Host "  2) pnpm --filter hrms-server db:migrate; pnpm --filter hrms-server db:seed"
Write-Host "  3) pnpm dev"
