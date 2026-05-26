# ซิงค์ HTML prototype จาก appHrKm → hrflow-app/prototype แล้ว push GitHub
param(
    [string]$Message = "sync: อัปเดต prototype HTML จาก appHrKm"
)

$src = "C:\Users\teerasak\Desktop\appHrKm"
$dst = Join-Path $PSScriptRoot "..\prototype" | Resolve-Path

if (-not (Test-Path $src)) {
    Write-Error "ไม่พบโฟลเดอร์ appHrKm: $src"
    exit 1
}

Copy-Item "$src\*.html" $dst -Force
Copy-Item "$src\style.css" $dst -Force
Write-Host "Copied HTML -> $dst"

$repo = Join-Path $PSScriptRoot ".."
Set-Location $repo
git add prototype/
$status = git status --porcelain prototype/
if (-not $status) {
    Write-Host "ไม่มีการเปลี่ยนแปลงใน prototype/ — ไม่ commit"
    exit 0
}

git commit -m $Message
git push origin main
Write-Host "Push สำเร็จ -> https://github.com/Kmspit/-HR.git (โฟลเดอร์ prototype/)"
