# review-slice.ps1 — 切片审核一键化：越界检查 + BOM 检查 + 验收命令组，输出汇总报告
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/review-slice.ps1 -SliceId <切片ID>
# 产物: logs/review-<SliceId>.md（PASS/FAIL 汇总 + 失败尾部摘要）；退出码 0=全过 1=有失败
# 注意: 本文件必须带 UTF-8 BOM（Windows PowerShell 5.1 否则按 GBK 解析中文注释会语法错误）
param(
    [Parameter(Mandatory = $true)][string]$SliceId,
    # 越界红线路径（必须 0 行改动）；按项目/切片覆盖
    [string[]]$ForbiddenPaths = @('server/src', 'server/prisma', 'client', 'package.json'),
    # 验收命令清单文件：每行「名称 | 命令 | 通过正则（可空）」，# 开头为注释
    [string]$ChecksFile = ''
)

$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$env:PATH = "$env:APPDATA\npm;$env:APPDATA\pnpm;C:\Program Files\nodejs;$env:PATH"

if ($ChecksFile -eq '') { $ChecksFile = Join-Path $root 'scripts\review-checks.txt' }

$report = Join-Path $root "logs\review-$SliceId.md"
New-Item -ItemType Directory -Force -Path (Join-Path $root 'logs') | Out-Null
$body = New-Object System.Text.StringBuilder
$failCount = 0

function Add-Step([string]$name, [string]$status, [string]$detail) {
    $script:body.AppendLine("## $name") | Out-Null
    $script:body.AppendLine('') | Out-Null
    $script:body.AppendLine("**$status**") | Out-Null
    $script:body.AppendLine('') | Out-Null
    if ($detail) {
        $script:body.AppendLine('```') | Out-Null
        $script:body.AppendLine($detail.Trim()) | Out-Null
        $script:body.AppendLine('```') | Out-Null
        $script:body.AppendLine('') | Out-Null
    }
    if ($status -match 'FAIL') { $script:failCount++ }
    Write-Output "$status $name"
}

function Invoke-Checked([string]$name, [string]$cmd, [string]$okPattern, [int]$tailLines = 30) {
    $out = cmd /c "$cmd 2>&1" | Out-String
    if ($LASTEXITCODE -eq 0 -and ($okPattern -eq '' -or $out -match $okPattern)) {
        Add-Step $name 'PASS' (($out -split "`n" | Select-Object -Last 6) -join "`n")
    } else {
        Add-Step $name 'FAIL' (($out -split "`n" | Select-Object -Last $tailLines) -join "`n")
    }
}

# 1. 越界检查
if ($ForbiddenPaths.Count -gt 0) {
    $diff = git diff --stat -- @ForbiddenPaths | Out-String
    $status = git status --porcelain | Out-String
    if ($diff.Trim() -eq '') {
        Add-Step ("越界检查（" + ($ForbiddenPaths -join ', ') + " 须 0 行改动）") 'PASS' $status
    } else {
        Add-Step ("越界检查（" + ($ForbiddenPaths -join ', ') + " 须 0 行改动）") 'FAIL' $diff
    }
}

# 2. BOM 检查（git 变更中的文本文件；.ps1 例外——PS5.1 要求带 BOM）
$changed = git status --porcelain | ForEach-Object { $_.Substring(3).Trim('"') } | Where-Object { $_ -match '\.(ts|tsx|vue|md|json|mjs|cjs|yml|yaml|css|html|prisma|py)$' -and (Test-Path $_) }
$bomHits = @()
foreach ($f in $changed) {
    $bytes = [System.IO.File]::ReadAllBytes((Join-Path $root $f))[0..2]
    if ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) { $bomHits += $f }
}
if ($bomHits.Count -eq 0) { Add-Step 'BOM 检查' 'PASS' ($changed -join "`n") } else { Add-Step 'BOM 检查' 'FAIL' ($bomHits -join "`n") }

# 3. 验收命令组（来自 review-checks.txt；无文件则只留提示）
if (Test-Path $ChecksFile) {
    Get-Content $ChecksFile -Encoding UTF8 | Where-Object { $_.Trim() -ne '' -and -not $_.Trim().StartsWith('#') } | ForEach-Object {
        $parts = $_ -split '\|', 3 | ForEach-Object { $_.Trim() }
        if ($parts.Count -ge 2) {
            $pattern = if ($parts.Count -ge 3) { $parts[2] } else { '' }
            Invoke-Checked $parts[0] $parts[1] $pattern
        }
    }
} else {
    Add-Step '验收命令组' 'SKIP' "未找到 $ChecksFile —— 请创建（格式见 review-checks.txt.example）后重跑"
}

# 汇总输出
$verdict = if ($failCount -eq 0) { '✅ 全部通过' } else { "❌ $failCount 项失败" }
$header = "# 审核报告 $SliceId（$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')）`n`n**结论：$verdict**`n`n"
[System.IO.File]::WriteAllText($report, $header + $body.ToString(), (New-Object System.Text.UTF8Encoding($false)))
Write-Output "REPORT=$report"
Write-Output "VERDICT=$verdict"
exit $(if ($failCount -eq 0) { 0 } else { 1 })
