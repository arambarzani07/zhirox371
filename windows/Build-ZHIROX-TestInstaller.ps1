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
Copy-Item windows/Start-ZHIROX-AutoSync-TRIAL.ps1 (Join-Path $root 'windows/Start-ZHIROX-AutoSync-TRIAL.ps1')
Copy-Item windows/Inspect-ZHIROX-RC-V53.ps1 (Join-Path $root 'windows/Inspect-ZHIROX-RC-V53.ps1')
Copy-Item windows/Start-ZHIROX-Print-V54.ps1 (Join-Path $root 'windows/Start-ZHIROX-Print-V54.ps1')
Copy-Item windows/Spool-ZHIROX-Receipt-V54.ps1 (Join-Path $root 'windows/Spool-ZHIROX-Receipt-V54.ps1')
# Compile an actual native Windows GUI EXE, not a PowerShell/Notepad shortcut.
$csc='C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(!(Test-Path $csc)){ throw 'Windows .NET Framework compiler not found' }
& $csc /nologo /target:winexe /platform:x64 /optimize+ /out:"$root\ZHIROX371.exe" /r:System.Windows.Forms.dll /r:System.Drawing.dll windows/ZHIROXLauncherV55.cs
if($LASTEXITCODE -ne 0){throw 'ZHIROX371 native Windows application compile failed'}
if(!(Test-Path (Join-Path $root 'ZHIROX371.exe'))){throw 'Missing real Windows app launcher EXE'}

Copy-Item windows/README-OFFLINE-TRIAL.txt (Join-Path $root 'README-OFFLINE-TRIAL.txt')
New-Item -ItemType Directory -Path (Join-Path $root 'docs') -Force | Out-Null
Copy-Item docs/V36_PREINSTALLATION_SOFTWARE.md (Join-Path $root 'docs/V36_PREINSTALLATION_SOFTWARE.md')
Copy-Item docs/V46_OFFLINE_CASH_ONLY_GO_LIVE_ACCEPTANCE.md (Join-Path $root 'docs/V46_OFFLINE_CASH_ONLY_GO_LIVE_ACCEPTANCE.md')
Copy-Item docs/V49_OFFLINE_ONLINE_AUTOSYNC_LAB.md (Join-Path $root 'docs/V49_OFFLINE_ONLINE_AUTOSYNC_LAB.md')
Copy-Item docs/V53_WINDOWS_RELEASE_CANDIDATE_FIELD_HANDOVER.md (Join-Path $root 'docs/V53_WINDOWS_RELEASE_CANDIDATE_FIELD_HANDOVER.md')
Copy-Item docs/V54_WINDOWS_PHYSICAL_RECEIPT_TEST.md (Join-Path $root 'docs/V54_WINDOWS_PHYSICAL_RECEIPT_TEST.md')
Copy-Item docs/V55_ONE_CLICK_WINDOWS_APP.md (Join-Path $root 'docs/V55_ONE_CLICK_WINDOWS_APP.md')
$bad=Get-ChildItem -File -Recurse $root | Where-Object {
  $_.Name -match '^\.env' -or $_.Extension -in @('.csv','.bak','.sqlite','.pem','.p12','.pfx','.key')
}
if($bad){throw 'Refusing to include non-manifested customer data or credential-like files'}
if(!(Test-Path (Join-Path $root 'node_modules/pg/package.json'))){throw 'Missing PostgreSQL driver'}
if(!(Test-Path (Join-Path $root 'dist/pilot-manifest-v36.json'))){throw 'Missing V36 manifest'}
if ((Get-ChildItem -File -Recurse $dist | Where-Object { $_.Extension -notin @('.html','.json','.js','.css') }).Count -gt 0) {
  throw 'Refusing unmanifested static asset type'
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
$exe='artifacts/ZHIROX371-V55-Offline-App-Setup.exe'
if(!(Test-Path $exe)){throw 'EXE missing after compile'}
(Get-FileHash $exe -Algorithm SHA256).Hash |
  Out-File 'ZHIROX371-V55-Offline-App-Setup.sha256.txt' -Encoding ascii
Write-Output 'Generated UNSIGNED offline TEST installer; NOT approved for real supermarket sales'
