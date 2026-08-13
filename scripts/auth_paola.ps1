$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$wacli = Join-Path $ProjectRoot "bin\wacli.exe"
$store = Join-Path $ProjectRoot "stores\paola"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "    INICIANDO VINCULACION CANAL PAOLA    " -ForegroundColor Yellow
Write-Host "    Store: $store" -ForegroundColor Gray
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Escanea el codigo QR que aparecera a continuacion con el WhatsApp de Paola." -ForegroundColor Green
Write-Host ""

& $wacli auth --store $store
