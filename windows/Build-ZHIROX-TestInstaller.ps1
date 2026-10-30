# Build an UNSIGNED TEST-ONLY EXE from the V36 isolated offline trial.
# No customer CSV, DB credentials, production hosts or private keys are packaged.
$ErrorActionPreference='Stop'
$root=Join-Path $pwd 'ZHIROX371-Windows-OFFLINE-TRIAL'
New-Item -ItemType Directory -Path $root -Force | Out-Null
Copy-Item (Get-Command node).Source (Join-Path $root 'node.exe')
$dist=Join-Path $root 'dist'
New-Item -ItemType Directory -Path (Join-Path $dist 'assets') -Force | Out-Null
Copy-Item dist/index.html (Join-Path $dist 'index.html')
Copy-Item dist/pilot-manifest-v36.json (Join-Path $dist 'pilot-manifest-v36.json')
$manifest=Get-Content dist/pilot-manifest-v36.json -Raw | ConvertFrom-Json
foreach($entry in $manifest.files.PSObject.Properties){
  $name=[string]$entry.Name
  if($name -eq '/index.html'){continue}
  if($name -notmatch '^/assets/[A-Za-z0-9._-]+\.(js|css)$'){
    throw "Manifest includes non-code asset: $name"
  }
  $relative=$name.TrimStart('/').Replace('/','\')
  Copy-Item (Join-Path 'dist' $relative) (Join-Path $dist $relative)
}
Copy-Item offline (Join-Path $root 'offline') -Recurse
Copy-Item node_modules (Join-Path $root 'node_modules') -Recurse
Copy-Item package.json (Join-Path $root 'package.json')
New-Item -ItemType Directory -Path (Join-Path $root 'windows') -Force | Out-Null
Copy-Item windows/Start-ZHIROX-Trial.ps1 (Join-Path $root 'windows/Start-ZHIROX-Trial.ps1')
Copy-Item windows/README-OFFLINE-TRIAL.txt (Join-Path $root 'README-OFFLINE-TRIAL.txt')
New-Item -ItemType Directory -Path (Join-Path $root 'docs') -Force | Out-Null
Copy-Item docs/V36_PREINSTALLATION_SOFTWARE.md (Join-Path $root 'docs/V36_PREINSTALLATION_SOFTWARE.md')
Copy-Item docs/V46_OFFLINE_CASH_ONLY_GO_LIVE_ACCEPTANCE.md (Join-Path $root 'docs/V46_OFFLINE_CASH_ONLY_GO_LIVE_ACCEPTANCE.md')
$bad=Get-ChildItem -File -Recurse $root | Where-Object {
  $_.Name -match '^\.env' -or $_.Extension -in @('.csv','.bak','.sqlite','.pem','.p12','.pfx','.key')
}
if($bad){throw 'Refusing to include non-manifested customer data or credential-like files'}
if(!(Test-Path (Join-Path $root 'node_modules/pg/package.json'))){throw 'Missing PostgreSQL driver'}
if(!(Test-Path (Join-Path $root 'dist/pilot-manifest-v36.json'))){throw 'Missing V36 manifest'}
$assets=Get-ChildItem -File -Recurse $dist | Select-Object -ExpandProperty FullName
if($assets.Count -ne ($manifest.files.PSObject.Properties.Count+1)){
  throw 'Unexpected files outside SHA-256 allowlisted assets (plus manifest)'
}
Compress-Archive -Path $root -DestinationPath 'ZHIROX371-Windows-OFFLINE-TRIAL.zip' -CompressionLevel Optimal
(Get-FileHash 'ZHIROX371-Windows-OFFLINE-TRIAL.zip' -Algorithm SHA256).Hash |
  Out-File 'ZHIROX371-Windows-OFFLINE-TRIAL.sha256.txt' -Encoding ascii
$compiler='C:\Program Files (x86)\Inno Setup 6\ISCC.exe'
if(!(Test-Path $compiler)){
  $cmd=Get-Command ISCC.exe -ErrorAction SilentlyContinue
  if(!$cmd){throw 'Inno Setup compiler missing on Windows runner'}
  $compiler=$cmd.Source
}
New-Item -ItemType Directory -Path artifacts -Force | Out-Null
& $compiler windows/ZHIROX-Offline-TRIAL.iss
if($LASTEXITCODE -ne 0){throw 'Windows EXE compiler failed'}
$exe='artifacts/ZHIROX371-Offline-Windows-TRIAL-Setup.exe'
if(!(Test-Path $exe)){throw 'EXE missing after compile'}
(Get-FileHash $exe -Algorithm SHA256).Hash |
  Out-File 'ZHIROX371-Offline-Windows-TRIAL-Setup.sha256.txt' -Encoding ascii
Write-Output 'Generated UNSIGNED offline TEST installer; NOT approved for real supermarket sales'
