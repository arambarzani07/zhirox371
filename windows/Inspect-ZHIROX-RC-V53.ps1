# ZHIROX371 V53 read-only candidate integrity verification.
# This does not unlock live sales or modify the local/cloud database.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root 'node.exe'
$checker = Join-Path $root 'offline\release-candidate-preflight-v53.mjs'
if (-not (Test-Path -LiteralPath $node -PathType Leaf)) {
  throw 'V53 preflight failed: portable runtime missing'
}
if (-not (Test-Path -LiteralPath $checker -PathType Leaf)) {
  throw 'V53 preflight failed: release candidate verifier missing'
}
Write-Host 'ZHIROX371 V53 — INSTALL INTEGRITY CHECK ONLY (NO REAL SALES)'
& $node $checker
if ($LASTEXITCODE -ne 0) {
  throw 'V53 integrity failure. Do not use this installation.'
}
Write-Host 'Integrity verification does not certify PostgreSQL, printer, scanner, cloud, or backup.'
Write-Host 'Official retail GO-LIVE remains NO-GO until owner-witnessed physical acceptance.'
