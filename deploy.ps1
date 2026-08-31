# M5-1: 一键部署脚本（PowerShell / Windows）
# 前置：Docker Desktop 已安装
# 用法：Copy-Item .env.production .env; .\deploy.ps1

$ErrorActionPreference = 'Stop'

Write-Host "===== HRMS 一键部署（生产环境）=====" -ForegroundColor Cyan

# 1. 检查依赖
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "❌ Docker 未安装" -ForegroundColor Red
  exit 1
}

# 2. 检查 .env
if (-not (Test-Path .env)) {
  if (Test-Path .env.production) {
    Write-Host "⚠️  .env 不存在，从 .env.production 复制" -ForegroundColor Yellow
    Copy-Item .env.production .env
  } else {
    Write-Host "❌ .env 和 .env.production 都不存在" -ForegroundColor Red
    exit 1
  }
}

# 3. 加载环境变量
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]*)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
  }
}

# 4. 检查必填变量
$required = @('JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY', 'DB_USER', 'DB_PASSWORD', 'DB_NAME')
foreach ($var in $required) {
  if (-not (Get-Item "Env:$var" -ErrorAction SilentlyContinue)) {
    Write-Host "❌ $var 未设置" -ForegroundColor Red
    exit 1
  }
}

# 5. 停止旧容器
Write-Host "🔄 停止旧容器..." -ForegroundColor Yellow
docker-compose down --remove-orphans 2>$null

# 6. 构建新镜像
Write-Host "🔨 构建新镜像..." -ForegroundColor Yellow
docker-compose build --no-cache

# 7. 启动服务
Write-Host "🚀 启动服务..." -ForegroundColor Green
docker-compose up -d

# 8. 等待健康检查
Write-Host "⏳ 等待服务健康检查..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# 9. 显示服务状态
Write-Host "📊 服务状态：" -ForegroundColor Cyan
docker-compose ps

# 10. 显示日志
Write-Host "📝 服务日志（Ctrl+C 退出）：" -ForegroundColor Cyan
docker-compose logs -f server client
