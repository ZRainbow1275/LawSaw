$ErrorActionPreference = 'Stop'

$npmGlobalRoot = (& npm root -g).Trim()
if (-not $npmGlobalRoot) {
  throw 'Unable to resolve `npm root -g`.'
}

$packageRoot = Join-Path $npmGlobalRoot '@openai\codex'
$launcherPath = Join-Path $packageRoot 'bin\codex.js'
$backupPath = Join-Path $packageRoot 'bin\codex.upstream.resume-fix.js'
$helperPath = Join-Path $env:USERPROFILE '.codex\tools\codex-resume-picker.js'
$metadataPath = Join-Path $env:USERPROFILE '.codex\tools\codex-resume-fix.json'

if (-not (Test-Path $backupPath)) {
  throw "Backup launcher not found: $backupPath"
}

Copy-Item $backupPath $launcherPath -Force

Write-Host 'Codex resume fix removed and upstream launcher restored.'
Write-Host "Launcher restored from: $backupPath"

if (Test-Path $helperPath) {
  Write-Host "Helper left in place: $helperPath"
}

if (Test-Path $metadataPath) {
  Write-Host "Metadata left in place: $metadataPath"
}
