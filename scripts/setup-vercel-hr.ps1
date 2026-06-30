# HR-only Vercel project — รันจาก hrflow-app (ต้อง npx vercel login แล้ว)
# ถ้า project ยังไม่มี: สร้างที่ https://vercel.com/new ชื่อ hrflow-hr จาก repo -HR

$ProjectName = "hrflow-hr"

Write-Host "=== HRFlow HR-only setup ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "ขั้นที่ 1: ตั้ง env ใน Vercel Dashboard -> $ProjectName -> Settings -> Environment Variables"
Write-Host "  NEXT_PUBLIC_DEPLOY_PROFILE = hr   (Production + Preview + Development)"
Write-Host ""
Write-Host "ขั้นที่ 2: Deploy (link project ครั้งแรกถ้ายังไม่เคย)"
Write-Host ""

npx vercel link --project $ProjectName --yes
npx vercel deploy --prod --yes

Write-Host ""
Write-Host "HR-only: ซ่อนโมดูลคดี/ลูกหนี้/billing — ดู docs/deploy-profiles.md" -ForegroundColor Green
