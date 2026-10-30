# V54 manual, isolated Windows receipt printer driver test only. NOT FOR SALES.
# Requires a disposable local PostgreSQL and a supervisor-enrolled 58/80mm printer.
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
foreach($file in @('node.exe','offline\windows-print-dispatch-v54.mjs',
  'windows\Spool-ZHIROX-Receipt-V54.ps1')){
  if(!(Test-Path -LiteralPath (Join-Path $root $file) -PathType Leaf)){
    throw "V54 print trial unavailable; missing $file"
  }
}
if($env:ZHIROX_V54_PRINTER_LAB_ENABLED -ne 'true' -or
   $env:ZHIROX_V54_TEST_MODE -ne 'true' -or
   $env:ZHIROX_RELEASE_MODE -eq 'official'){
  throw 'V54 only available to explicit disposable printer LAB'
}
Write-Host 'ZHIROX371 TEST ONLY: Windows spool submission does NOT prove physical paper printed.'
Write-Host 'A printer error requires MANUAL REVIEW. Do not run this on real customer sales.'
Push-Location $root
try {
  & .\node.exe .\offline\windows-print-dispatch-v54.mjs
  if($LASTEXITCODE -ne 0){ throw 'V54 print attempt failed or requires manual review' }
} finally {Pop-Location}
