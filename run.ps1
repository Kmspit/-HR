# รันทุกอย่างที่ลิงก์เดียว: http://localhost:3000 (แอปจริง + prototype)
$ErrorActionPreference = "Stop"
$src = $PSScriptRoot
$hrflow = Join-Path (Split-Path $src -Parent) "hrflow-app"

if (-not (Test-Path $hrflow)) {
    throw "ไม่พบ hrflow-app ที่: $hrflow"
}

$dst = Join-Path $hrflow "prototype"
Copy-Item "$src\*.html" $dst -Force
foreach ($file in @("style.css", "hr-core.js", "dev-banner.js", "face-core.js", "dashboard.js", "attendance.js")) {
    $path = Join-Path $src $file
    if (Test-Path $path) { Copy-Item $path $dst -Force }
}

Set-Location $hrflow
Write-Host ""
Write-Host "  เปิดเบราว์เซอร์:"
Write-Host "    แอปจริง     http://localhost:3000"
Write-Host "    ต้นแบบ HTML http://localhost:3000/prototype/login.html"
Write-Host "    ล็อกอิน demo employee@demo.com / demo1234"
Write-Host ""
npm run dev
