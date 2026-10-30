# ZHIROX371 V48 - OFFLINE WINDOWS LAB ONLY. NOT an official cashier installer.
# Must be run by a trained operator after an isolated PostgreSQL test DB and local TLS have been provisioned.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$required = @(
  'ZHIROX_V33_BIND_IP','ZHIROX_V33_ALLOWED_PEERS','ZHIROX_V33_ALLOWED_ORIGIN',
  'ZHIROX_V33_TLS_CERT_PATH','ZHIROX_V33_TLS_KEY_PATH',
  'ZHIROX_V33_DISPOSABLE_DB_URL','ZHIROX_LOCAL_SESSION_SECRET'
)
foreach ($key in $required) {
  $value = [Environment]::GetEnvironmentVariable($key, 'Process')
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "TRIAL STOP: required local environment variable $key is not set. No service launched."
  }
}
$url = [Environment]::GetEnvironmentVariable('ZHIROX_V33_DISPOSABLE_DB_URL','Process')
try { $parsed = [uri]::new($url) } catch { throw 'TRIAL STOP: invalid local PostgreSQL URI' }
if ($parsed.Scheme -notin @('postgresql','postgres')) { throw 'TRIAL STOP: not a PostgreSQL URI' }
if ($parsed.Host -notin @('localhost','127.0.0.1','::1') -and
  $parsed.Host -notmatch '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)') {
  throw 'TRIAL STOP: only private isolated PostgreSQL is permitted'
}
if ($parsed.AbsolutePath -notmatch '(test|trial|disposable)') {
  throw 'TRIAL STOP: the database name must be clearly marked test/trial/disposable'
}
if ($env:ZHIROX_RELEASE_MODE -eq 'official' -or $env:VITE_ZHIROX_RELEASE_MODE -eq 'official') {
  throw 'TRIAL STOP: production use is not certified'
}
$node = Join-Path $root 'node.exe'
$server = Join-Path $root 'offline\lan-gateway-v33.mjs'
$manifest = Join-Path $root 'dist\pilot-manifest-v36.json'
foreach ($file in @($node,$server,$manifest)) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "TRIAL STOP: missing $file" }
}
$env:ZHIROX_V33_LAN_TRIAL_ENABLED = 'true'
$env:ZHIROX_V34_RECEIPT_PREVIEW_ENABLED = 'true'
$env:ZHIROX_V35_PRINT_QUEUE_ENABLED = 'true'
$env:ZHIROX_V36_LAN_PILOT_ENABLED = 'true'
$env:ZHIROX_V36_STATIC_DIR = (Resolve-Path (Join-Path $root 'dist')).Path
Write-Host 'ZHIROX371 ISOLATED OFFLINE TEST ONLY. No real sales. Press Ctrl+C to stop.'
Set-Location -LiteralPath $root
& $node $server
exit $LASTEXITCODE
