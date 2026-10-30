# ZHIROX371 V54 Windows GDI spooler - DISPOSABLE TEST ONLY
# Never assert that spool acceptance proves paper delivery.
param(
  [Parameter(Mandatory=$true)][string]$PrinterName,
  [Parameter(Mandatory=$true)][ValidateSet(58,80)][int]$WidthMm,
  [switch]$CheckOnly
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
if ([string]::IsNullOrWhiteSpace($PrinterName) -or $PrinterName.Length -gt 128) {
  throw 'Missing exact test printer name'
}
$settings = New-Object System.Drawing.Printing.PrinterSettings
$settings.PrinterName = $PrinterName
if (-not $settings.IsValid) { throw 'Approved test printer is unavailable' }
if ($CheckOnly) { Write-Output 'TEST_PRINTER_PRESENT'; exit 0 }

# Verify the printer driver offers an exact supported receipt paper width.
$hundredthInch = if($WidthMm -eq 58) {228} else {315}
$paper = @($settings.PaperSizes | Where-Object {
  [Math]::Abs([int]$_.Width - $hundredthInch) -le 4
} | Select-Object -First 1)
if ($paper.Count -ne 1) { throw 'Driver does not advertise the selected 58/80mm roll width' }

$inputJson=[Console]::In.ReadToEnd()
if ([Text.Encoding]::UTF8.GetByteCount($inputJson) -gt 8192) {
  throw 'Receipt too large'
}
$receipt=$inputJson | ConvertFrom-Json
if ($null -eq $receipt -or $receipt.paper_width_mm -ne $WidthMm -or
    $receipt.lines.Count -lt 1 -or $receipt.lines.Count -gt 25) {
  throw 'Invalid validated receipt payload'
}
# .NET GDI receives only strings. No PowerShell code or raw ESC/POS bytes
# are taken from the cashier browser. Formatting/shaping must be device tested.
$rows=New-Object 'System.Collections.Generic.List[string]'
$rows.Add('ZHIROX371 — تاقیکردنەوە')
$rows.Add('NOT FOR REAL CUSTOMER SALES')
$rows.Add([string]$receipt.store_name)
$rows.Add('کوردستان')
$rows.Add(('ژمارەی پسووڵە: '+$receipt.receipt_no))
$rows.Add([string]$receipt.issued_at)
$rows.Add('--------------------------------')
$rows.Add('ژمارە | ناو | یەکە | نرخ | بڕ | کۆ')
foreach($line in $receipt.lines){
  $unit=switch([string]$line.sale_mode){
    'carton' {'کارتۆن'}
    'scale' {'کیلۆگرام'}
    default {'دانە'}
  }
  $rows.Add(([string]$line.line_no+' '+[string]$line.name))
  $rows.Add(($unit+' | '+[string]$line.price_iqd+' | '+[string]$line.quantity+' | '+[string]$line.total_iqd))
}
$rows.Add('--------------------------------')
$rows.Add(('کۆی گشتی: '+[string]$receipt.total_iqd+' IQD'))
$rows.Add('LAB RECEIPT - NOT CERTIFIED')

$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.PrinterSettings.PrinterName=$PrinterName
$doc.DefaultPageSettings.PaperSize=$paper[0]
$doc.DocumentName='ZHIROX371 V54 TEST RECEIPT'
$doc.PrintController=New-Object System.Drawing.Printing.StandardPrintController
$doc.OriginAtMargins=$true
$font=New-Object System.Drawing.Font('Tahoma',8,[System.Drawing.FontStyle]::Regular)
$brush=[System.Drawing.Brushes]::Black
$format=New-Object System.Drawing.StringFormat
$format.FormatFlags=[System.Drawing.StringFormatFlags]::DirectionRightToLeft
$format.Alignment=[System.Drawing.StringAlignment]::Far
$renderLines=$rows.ToArray()
$doc.add_PrintPage({
  param($sender,$e)
  $height=[single]($font.GetHeight($e.Graphics)+4)
  $y=[single]0
  foreach($line in $renderLines){
    if($y+$height -gt [single]$e.MarginBounds.Height){
      throw 'Receipt exceeds supported paper page; operator must review'
    }
    $rect=New-Object System.Drawing.RectangleF([single]0,$y,
      [single]$e.MarginBounds.Width,$height)
    $e.Graphics.DrawString($line,$font,$brush,$rect,$format)
    $y+=$height
  }
  $e.HasMorePages=$false
}.GetNewClosure())
try {
  $doc.Print()
  Write-Output 'SUBMITTED_TO_WINDOWS_SPOOLER_ONLY'
} finally {
  $font.Dispose()
  $format.Dispose()
  $doc.Dispose()
}
