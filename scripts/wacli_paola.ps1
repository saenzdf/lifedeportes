param(
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$ArgsList
)

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$wacli = Join-Path $ProjectRoot "bin\wacli.exe"
$store = Join-Path $ProjectRoot "stores\paola"

& $wacli @ArgsList --store $store
