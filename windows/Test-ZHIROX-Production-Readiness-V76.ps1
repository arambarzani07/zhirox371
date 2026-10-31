# V76: read-only production installer preflight. Never modifies POS or real data.
param([switch]$Json)
$ErrorActionPreference = 'Stop'
$checks = [ordered]@{}
$checks['windows_x64'] = ([Environment]::Is64BitOperatingSystem)
$checks['windows_10_or_11'] = ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT -and [Environment]::OSVersion.Version.Major -ge 10)
$checks['local_disk_available'] = $false
try {
  $drive = Get-PSDrive -Name ($env:SystemDrive.TrimEnd(':')) -ErrorAction Stop
  $checks['local_disk_available'] = ($drive.Free -ge 4GB)
} catch {}
$checks['production_local_postgresql_installer_bundled'] = $false
$checks['production_database_schema_migration_verified'] = $false
$checks['production_rollback_and_backup_verified'] = $false
$checks['production_signed_auto_update_verified'] = $false
$checks['production_thermal_printing_field_verified'] = $false
$checks['production_cashier_end_to_end_field_verified'] = $false
$checks['production_cloud_sync_field_verified'] = $false
$approved = ($checks.Values -notcontains $false)
$result = [ordered]@{
  application = 'ZHIROX371'
  gate = 'V76 Windows commercial-installation readiness'
  status = $(if($approved){'GO'} else {'NO_GO'})
  checks = $checks
  notes = 'Read-only gate. V75 executable is lab-only and cannot be represented as official retail software.'
}
if($Json){$result | ConvertTo-Json -Depth 5}
else {
  Write-Output ('ZHIROX371 Windows release gate: ' + $result.status)
  foreach($name in $checks.Keys){ Write-Output ('  ' + $name + ': ' + $checks[$name]) }
}
if(-not $approved){ exit 2 }
