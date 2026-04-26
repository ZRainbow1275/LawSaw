param(
  [int]$Limit = 20,
  [string]$Query,
  [string]$Resume,
  [switch]$Pick,
  [switch]$IncludeExec,
  [switch]$AllSources,
  [switch]$DryRun,
  [switch]$Doctor
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $repoRoot 'list_sessions.js'

if (-not (Test-Path $scriptPath)) {
  throw "Missing helper script: $scriptPath"
}

$args = @($scriptPath, '--limit', $Limit.ToString())

if ($Query) {
  $args += @('--query', $Query)
}

if ($Resume) {
  $args += @('--resume', $Resume)
}

if ($Pick) {
  $args += '--pick'
}

if ($IncludeExec) {
  $args += '--include-exec'
}

if ($AllSources) {
  $args += '--all-sources'
}

if ($DryRun) {
  $args += '--dry-run'
}

if ($Doctor) {
  $args += '--doctor'
}

& node @args
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
  exit $exitCode
}
