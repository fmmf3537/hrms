# codex-run.ps1 — 以后台方式运行 codex exec 执行一个开发切片（与 dsh-run.ps1 同约定）
# 用法: powershell -NoProfile -File scripts/codex-run.ps1 -SliceId M5-2-D3 -PromptFile docs/cursor-prompts/M5-2-D3.md
# 产物: logs/codex/<SliceId>.log（实时输出）+ <SliceId>.last.md（最终回复）+ <SliceId>.exitcode + <SliceId>.pid
param(
    [Parameter(Mandatory = $true)][string]$SliceId,
    [Parameter(Mandatory = $true)][string]$PromptFile
)

$ErrorActionPreference = 'Stop'
$root = 'D:\projects\hrms'
$logDir = Join-Path $root 'logs\codex'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$log = Join-Path $logDir "$SliceId.log"
$lastMsg = Join-Path $logDir "$SliceId.last.md"
$exitFile = Join-Path $logDir "$SliceId.exitcode"
$taskFile = Join-Path $logDir "$SliceId.task.txt"

$promptPath = Join-Path $root ($PromptFile -replace '/', '\')
if (-not (Test-Path $promptPath)) { throw "提示词文件不存在: $promptPath" }
$task = "你是本仓库的资深全栈工程师。请先用文件读取工具完整阅读 $promptPath（那是一份详尽的开发任务提示词），然后严格按提示词要求在本仓库完成开发。提示词中的红线与禁改清单必须无条件遵守。完成后按提示词 7.2 节模板输出完整交付报告作为你的最终回复。开始执行前先输出你的实施计划，然后直接动手，不要等确认。"
[System.IO.File]::WriteAllText($taskFile, $task + "`r`n")

Remove-Item $log, $exitFile, $lastMsg -ErrorAction SilentlyContinue

# 凭据从 Windows 用户级环境变量注入子进程（不落地、不打印）
$env:MINIMAX_API_KEY = [Environment]::GetEnvironmentVariable('MINIMAX_API_KEY', 'User')
$env:PATH = 'C:\Users\fmmf\AppData\Roaming\npm;C:\Program Files\nodejs;' + $env:PATH

$proc = Start-Process -FilePath (Join-Path $root 'scripts\codex-exec.cmd') -ArgumentList $SliceId -WindowStyle Hidden -PassThru
[System.IO.File]::WriteAllText((Join-Path $logDir "$SliceId.pid"), [string]$proc.Id)
Write-Output "STARTED slice=$SliceId pid=$($proc.Id) log=$log"
