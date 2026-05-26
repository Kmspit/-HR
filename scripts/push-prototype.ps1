# Run from hrflow-app OR delegates to appHrKm push-github.ps1
$appHrKm = Join-Path (Split-Path $PSScriptRoot -Parent) "..\appHrKm"
$script = Join-Path $appHrKm "push-github.ps1"

if (-not (Test-Path $script)) {
    throw "Not found: $script"
}

& $script @args
