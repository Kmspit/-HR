# Phase 2 — ตั้ง NEXT_PUBLIC_FROZEN_MODULES บน production หลังทีมตอบแบบสำรวจ

# ตัวอย่าง: .\scripts\phase-2-apply-frozen.ps1 -Modules "/training,/knowledge,/automation"



param(

  [Parameter(Mandatory = $true)]

  [string]$Modules,

  [string]$Project = "hrflow-app"

)



Write-Host "=== Phase 2 module freeze ===" -ForegroundColor Cyan

Write-Host "Project: $Project"

Write-Host "NEXT_PUBLIC_FROZEN_MODULES = $Modules"

Write-Host ""



npx vercel env rm NEXT_PUBLIC_FROZEN_MODULES production --yes 2>$null

echo $Modules | npx vercel env add NEXT_PUBLIC_FROZEN_MODULES production

npx vercel deploy --prod --yes



Write-Host ""

Write-Host "Redeploy แล้ว — เมนูที่ freeze จะหาย + URL redirect /unauthorized" -ForegroundColor Green

