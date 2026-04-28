param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$InstallerArgs
)

$ErrorActionPreference = "Stop"

function Write-Step($Message) {
  Write-Host "› $Message" -ForegroundColor Cyan
}

function Write-Ok($Message) {
  Write-Host "✓ $Message" -ForegroundColor Green
}

function Fail($Message) {
  Write-Host "✗ $Message" -ForegroundColor Red
  exit 1
}

$LocalInstaller = $null
if ($PSScriptRoot) {
  $Candidate = Join-Path $PSScriptRoot "bin\install.mjs"
  if (Test-Path $Candidate) {
    $LocalInstaller = $Candidate
  }
}

Write-Host ""
Write-Host "Codex shimplify Installer" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan

if ($LocalInstaller) {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail "Node.js is required for local install. Install Node.js 18+ and retry."
  }

  Write-Step "Running local installer"
  & node $LocalInstaller @InstallerArgs
  exit $LASTEXITCODE
}

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  Fail "npx was not found. Install Node.js 18+ from https://nodejs.org/ and retry."
}

$PackageSpec = $env:SHIMPLIFY_PACKAGE
if (-not $PackageSpec) {
  $PackageSpec = "github:kirillshsh/shimplify"
}

Write-Step "Fetching installer package with npx"
Write-Ok "Package: $PackageSpec"
& npx --yes $PackageSpec @InstallerArgs
exit $LASTEXITCODE
