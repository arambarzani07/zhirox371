# Start only the V49 disposable-local automatic outbox retry LAB worker.
# Do NOT put this in Startup or Task Scheduler, and do not run on live market data.
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$node=Join-Path $root 'node.exe'
$worker=Join-Path $root 'offline\autosync-v49.mjs'
foreach($f in @($node,$worker)){
  if(!(Test-Path -LiteralPath $f -PathType Leaf)){throw "Trial missing required file: $f"}
}
# The worker itself enforces opt-in, a loopback-only receiver, and test DB name.
# Never print the database URL or HMAC secret to terminal or logs.
Write-Host "ZHIROX371 V49 SIMULATED offline/online sync - LAB ONLY. NO real sales."
Write-Host "Requires a disposable PostgreSQL database and a trusted localhost test receiver."
Write-Host "You can stop this background-adjacent worker with Ctrl+C. Cashier has a separate process."
Set-Location -LiteralPath $root
& $node $worker
exit $LASTEXITCODE
