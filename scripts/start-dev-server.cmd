@echo off
rem start-dev-server.cmd — 后台启动后端 dev server（联调/E2E/压测用），输出到 logsdev-server.log，输出到 logs\dev-server.log
setlocal
set PATH=%APPDATA%\npm;C:\Program Files\nodejs;%PATH%
cd /d D:\projects\hrms
pnpm --filter hrms-server dev > logs\dev-server.log 2>&1
