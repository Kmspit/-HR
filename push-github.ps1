param(
    [string]$Message = "sync: update prototype from appHrKm"
)

$ErrorActionPreference = "Stop"
$src = $PSScriptRoot
$hrflow = Join-Path (Split-Path $src -Parent) "hrflow-app"

if (-not (Test-Path $hrflow)) {
    throw "hrflow-app not found at: $hrflow"
}

$dst = Join-Path $hrflow "prototype"
Copy-Item "$src\*.html" $dst -Force
foreach ($file in @("style.css", "hr-core.js", "dev-banner.js", "face-core.js", "dashboard.js", "attendance-gps.js", "attendance-camera.js", "attendance-flow.js")) {
    $path = Join-Path $src $file
    if (Test-Path $path) {
        Copy-Item $path $dst -Force
    }
}
$workersSrc = Join-Path $src "workers"
$workersDst = Join-Path $dst "workers"
if (Test-Path $workersSrc) {
    if (-not (Test-Path $workersDst)) { New-Item -ItemType Directory -Path $workersDst | Out-Null }
    Copy-Item "$workersSrc\*.js" $workersDst -Force
}

Set-Location $hrflow
node scripts/sync-prototype.mjs
git add prototype/
$pending = git status --porcelain prototype/
if (-not $pending) {
    Write-Host "No changes in prototype/. GitHub is already up to date."
    Write-Host "https://github.com/Kmspit/-HR/tree/main/prototype"
    exit 0
}

git commit -m $Message
git push origin main
if ($LASTEXITCODE -ne 0) {
    throw "git push failed"
}
Write-Host ""
Write-Host "PUSH OK"
Write-Host "Prototype: https://github.com/Kmspit/-HR/tree/main/prototype"
Write-Host "Next.js app: https://github.com/Kmspit/-HR"
