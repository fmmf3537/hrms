# dsh-run.ps1 — 以后台方式运行 dsh headless 执行一个开发切片
# 用法: powershell -NoProfile -File scripts/dsh-run.ps1 -SliceId M5-2-D1 -PromptFile docs/cursor-prompts/M5-2-D1.md
# 产物: logs/dsh/<SliceId>.log（实时输出）+ logs/dsh/<SliceId>.exitcode（完成后写入退出码）+ <SliceId>.pid
param(
    [Parameter(Mandatory = $true)][string]$SliceId,
    [Parameter(Mandatory = $true)][string]$PromptFile
)

$ErrorActionPreference = 'Stop'
$root = 'D:\projects\hrms'
$logDir = Join-Path $root 'logs\dsh'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$log = Join-Path $logDir "$SliceId.log"
$exitFile = Join-Path $logDir "$SliceId.exitcode"
$taskFile = Join-Path $logDir "$SliceId.task.txt"

# 任务文本保持短（提示词正文由 agent 自己读文件），避开命令行长度上限
$promptPath = Join-Path $root ($PromptFile -replace '/', '\')
if (-not (Test-Path $promptPath)) { throw "提示词文件不存在: $promptPath" }
$task = "你是本仓库的资深全栈工程师。请先用文件读取工具完整阅读 $promptPath（那是一份详尽的开发任务提示词），然后严格按提示词要求在本仓库完成开发。提示词中的红线与禁改清单必须无条件遵守。完成后运行提示词 7.1 节的全部验收命令并把结果写入你的最终回复。开始执行前先输出你的实施计划，然后直接动手，不要等确认。"
[System.IO.File]::WriteAllText($taskFile, $task)

Remove-Item $log, $exitFile -ErrorAction SilentlyContinue

$proc = Start-Process -FilePath (Join-Path $root 'scripts\dsh-exec.cmd') -ArgumentList $SliceId -WindowStyle Hidden -PassThru
[System.IO.File]::WriteAllText((Join-Path $logDir "$SliceId.pid"), [string]$proc.Id)
Write-Output "STARTED slice=$SliceId pid=$($proc.Id) log=$log"
