param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceHelper = Join-Path $repoRoot 'list_sessions.js'
$sourceWrapper = Join-Path $PSScriptRoot 'codex-resume-launcher.js'

if (-not (Test-Path $sourceHelper)) {
  throw "Missing helper source: $sourceHelper"
}

if (-not (Test-Path $sourceWrapper)) {
  throw "Missing wrapper source: $sourceWrapper"
}

$npmGlobalRoot = (& npm root -g).Trim()
if (-not $npmGlobalRoot) {
  throw 'Unable to resolve `npm root -g`.'
}

$packageRoot = Join-Path $npmGlobalRoot '@openai\codex'
$launcherPath = Join-Path $packageRoot 'bin\codex.js'
$backupPath = Join-Path $packageRoot 'bin\codex.upstream.resume-fix.js'

if (-not (Test-Path $launcherPath)) {
  throw "Codex launcher not found: $launcherPath"
}

$helperDir = Join-Path $env:USERPROFILE '.codex\tools'
$helperPath = Join-Path $helperDir 'codex-resume-picker.js'
$metadataPath = Join-Path $helperDir 'codex-resume-fix.json'

New-Item -ItemType Directory -Path $helperDir -Force | Out-Null

$marker = 'codex.upstream.resume-fix.js'
$launcherContent = Get-Content $launcherPath -Raw -Encoding UTF8
$alreadyPatched = $launcherContent.Contains($marker)

if ((-not $alreadyPatched) -or $Force) {
  if (-not (Test-Path $backupPath) -or $Force) {
    Copy-Item $launcherPath $backupPath -Force
  }
}

Copy-Item $sourceHelper $helperPath -Force
Copy-Item $sourceWrapper $launcherPath -Force

$metadata = @{
  installed_at = (Get-Date).ToString('s')
  npm_global_root = $npmGlobalRoot
  package_root = $packageRoot
  launcher_path = $launcherPath
  backup_path = $backupPath
  helper_path = $helperPath
  repo_source = $repoRoot
} | ConvertTo-Json -Depth 4

Set-Content -Path $metadataPath -Value $metadata -Encoding UTF8

Write-Host 'Codex resume fix installed.'
Write-Host "Launcher: $launcherPath"
Write-Host "Backup:   $backupPath"
Write-Host "Helper:   $helperPath"
Write-Host ''
Write-Host 'Patched behavior:'
Write-Host '- `codex resume`      -> use local session picker filtered by current cwd'
Write-Host '- `codex resume --all`-> use local session picker across all stored sessions'
Write-Host '- `codex resume --last` and `codex resume <id>` remain untouched'
