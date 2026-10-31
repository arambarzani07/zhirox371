# V77 — fail-closed Windows EXE release staging, backup + rollback.
# NO automatic production installation. Only package integrity staging into private local folder.
# Never touches installed POS or financial data; explicit operator approval required to apply.
param(
 [Parameter(Mandatory=$true)][string]$ManifestPath,
 [Parameter(Mandatory=$true)][string]$PackagePath,
 [string]$StagingRoot = (Join-Path $env:LOCALAPPDATA 'ZHIROX371\staging'),
 [switch]$RestorePrevious,
 [switch]$Json
)
$ErrorActionPreference='Stop'
function Fail($reason) { throw "ZHIROX_V77_REFUSED:$reason" }
if ($env:ZHIROX_RELEASE_MODE -eq 'official') { Fail 'commercial_update_gate_not_approved' }
if (-not [IO.Path]::IsPathRooted($StagingRoot)) { Fail 'staging_must_be_absolute' }
$fullStaging=[IO.Path]::GetFullPath($StagingRoot)
if ($fullStaging -match '^(?i:[A-Z]:\\Windows|[A-Z]:\\Program Files|[A-Z]:\\ProgramData)' -or
 $fullStaging.StartsWith('\\')) { Fail 'staging_in_system_or_network_path' }
New-Item -ItemType Directory -Path $fullStaging -Force | Out-Null
$lock=[IO.File]::Open((Join-Path $fullStaging '.update.lock'),'OpenOrCreate','ReadWrite','None')
try {
 $active=Join-Path $fullStaging 'candidate'
 $previous=Join-Path $fullStaging 'previous'
 if($RestorePrevious){
   if(-not (Test-Path -LiteralPath (Join-Path $previous 'installer.exe') -PathType Leaf)){Fail 'no_previous_candidate'}
   $temp=Join-Path $fullStaging ('retired-'+[guid]::NewGuid().ToString('N'))
   if(Test-Path -LiteralPath $active){Move-Item -LiteralPath $active -Destination $temp}
   Move-Item -LiteralPath $previous -Destination $active
   if(Test-Path -LiteralPath $temp){Move-Item -LiteralPath $temp -Destination $previous}
   Write-Output 'V77 rollback: only the STAGED candidate reverted. Installed POS unchanged.'
   return
 }
 if(!(Test-Path -LiteralPath $ManifestPath -PathType Leaf) -or
    !(Test-Path -LiteralPath $PackagePath -PathType Leaf)){Fail 'manifest_or_installer_missing'}
 $raw=Get-Content -LiteralPath $ManifestPath -Raw
 if($raw.Length -gt 8192){Fail 'manifest_too_large'}
 $manifest=$raw|ConvertFrom-Json
 if($manifest.application -ne 'ZHIROX371' -or
    $manifest.channel -ne 'lab' -or
    $manifest.release_status -ne 'NO_GO' -or
    $manifest.version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+-lab$' -or
    $manifest.sha256 -notmatch '^[a-fA-F0-9]{64}$' -or
    $manifest.file -ne 'installer.exe'){Fail 'invalid_or_unapproved_manifest'}
 $got=(Get-FileHash -LiteralPath $PackagePath -Algorithm SHA256).Hash
 if($got -ne $manifest.sha256){Fail 'package_sha256_mismatch'}
 if((Get-Item -LiteralPath $PackagePath).Length -gt 500MB){Fail 'package_too_large'}
 $incoming=Join-Path $fullStaging ('incoming-'+[guid]::NewGuid().ToString('N'))
 New-Item -ItemType Directory -Path $incoming | Out-Null
 try {
   Copy-Item -LiteralPath $PackagePath -Destination (Join-Path $incoming 'installer.exe')
   Copy-Item -LiteralPath $ManifestPath -Destination (Join-Path $incoming 'manifest.json')
   if((Get-FileHash -LiteralPath (Join-Path $incoming 'installer.exe') -Algorithm SHA256).Hash -ne $got){
     Fail 'staged_copy_mismatch'
   }
   if(Test-Path -LiteralPath $previous){Fail 'previous_candidate_pending_manual_review'}
   if(Test-Path -LiteralPath $active){Move-Item -LiteralPath $active -Destination $previous}
   Move-Item -LiteralPath $incoming -Destination $active
   if($Json){[pscustomobject]@{status='STAGED_ONLY';version=$manifest.version;sha256=$got;
    installed_exe_modified=$false;financial_data_modified=$false;rollback_candidate=(Test-Path $previous)}|ConvertTo-Json -Compress}
   else {Write-Output "V77 STAGED_ONLY: $($manifest.version), application and financial data untouched"}
 }finally{if(Test-Path -LiteralPath $incoming){Remove-Item -LiteralPath $incoming -Recurse -Force}}
}finally{$lock.Dispose()}
