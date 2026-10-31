$ErrorActionPreference='Stop'
$root=Join-Path $env:RUNNER_TEMP ('zhirox-v77-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
try{
 $install=Join-Path $root 'installer.exe'
 $manifest=Join-Path $root 'manifest.json'
 $stage=Join-Path $root 'staging'
 Set-Content -LiteralPath $install -Value 'synthetic-disposable-windows-installer-v77' -NoNewline
 $sha=(Get-FileHash -LiteralPath $install -Algorithm SHA256).Hash
 @{application='ZHIROX371';channel='lab';release_status='NO_GO';version='77.0.0-lab';sha256=$sha;file='installer.exe'}|ConvertTo-Json|Set-Content -LiteralPath $manifest
 $script=Join-Path $PWD 'windows/Stage-ZHIROX-Update-V77.ps1'
 $r=& $script -ManifestPath $manifest -PackagePath $install -StagingRoot $stage -Json | ConvertFrom-Json
 if($r.status -ne 'STAGED_ONLY' -or $r.installed_exe_modified -ne $false){throw 'stage failed'}
 if((Get-FileHash (Join-Path $stage 'candidate/installer.exe') -Algorithm SHA256).Hash -ne $sha){throw 'wrong candidate'}
 # Retain old candidate when new, different package is staged.
 Set-Content -LiteralPath $install -Value 'synthetic-disposable-windows-installer-v78' -NoNewline
 $sha2=(Get-FileHash -LiteralPath $install -Algorithm SHA256).Hash
 @{application='ZHIROX371';channel='lab';release_status='NO_GO';version='78.0.0-lab';sha256=$sha2;file='installer.exe'}|ConvertTo-Json|Set-Content -LiteralPath $manifest
 $r=& $script -ManifestPath $manifest -PackagePath $install -StagingRoot $stage -Json | ConvertFrom-Json
 if($r.rollback_candidate -ne $true){throw 'missing rollback'}
 if((Get-FileHash (Join-Path $stage 'previous/installer.exe') -Algorithm SHA256).Hash -ne $sha){throw 'previous overwritten'}
 & $script -ManifestPath $manifest -PackagePath $install -StagingRoot $stage -RestorePrevious | Out-Null
 if((Get-FileHash (Join-Path $stage 'candidate/installer.exe') -Algorithm SHA256).Hash -ne $sha){throw 'rollback failed'}
 # Tampered payload MUST never replace staged candidate.
 $bad=Join-Path $root 'tampered.exe'
 Set-Content -LiteralPath $bad -Value 'forged payload'
 $wasRefused=$false
 try { & $script -ManifestPath $manifest -PackagePath $bad -StagingRoot $stage | Out-Null }catch{$wasRefused=$true}
 if(-not $wasRefused){throw 'tamper not refused'}
 if((Get-FileHash (Join-Path $stage 'candidate/installer.exe') -Algorithm SHA256).Hash -ne $sha){throw 'tamper mutated state'}
 # Direct production gate MUST fail closed.
 $env:ZHIROX_RELEASE_MODE='official'
 $wasRefused=$false
 try { & $script -ManifestPath $manifest -PackagePath $install -StagingRoot $stage | Out-Null }catch{$wasRefused=$true}
 if(-not $wasRefused){throw 'production bypass'}
 Remove-Item Env:ZHIROX_RELEASE_MODE
 Write-Output 'V77 PASS: two staged candidates, one rollback, SHA tamper rejection, production refusal'
}finally{
 Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
