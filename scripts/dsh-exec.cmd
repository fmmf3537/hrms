@echo off
rem dsh-exec.cmd <SliceId> — 由 dsh-run.ps1 调用，普通用户勿直接运行
setlocal
set SLICE=%~1
set ROOT=D:\projects\hrms
set LOGDIR=%ROOT%\logs\dsh
chcp 65001 >nul
set PATH=C:\Users\fmmf\AppData\Roaming\npm;C:\Users\fmmf\AppData\Roaming\pnpm;%PATH%
cd /d %ROOT%
set /p TASK=<"%LOGDIR%\%SLICE%.task.txt"
pnpm dlx @deepseek-ai/dsh --profile headless "%TASK%" > "%LOGDIR%\%SLICE%.log" 2>&1
echo %ERRORLEVEL% > "%LOGDIR%\%SLICE%.exitcode"
