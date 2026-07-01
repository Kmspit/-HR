# Copy production env from hrflow-app to hrflow-hr + hrflow-legal
# Sensitive Vercel vars cannot be read via env pull - sync runs on production runtime.# Usage: .\scripts\copy-vercel-env-to-deploys.ps1
# Requires: npx vercel login, hrflow-app deployed with /api/cron/sync-deploy-env

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$EnvFile = Join-Path $Root ".env.hrflow-app"
$AuthFile = Join-Path $env:APPDATA "xdg.data\com.vercel.cli\auth.json"
$ProdUrl = "https://hrflow-app-gamma.vercel.app"

Set-Location $Root

Write-Host "=== 1. Pull env keys from hrflow-app (production) ===" -ForegroundColor Cyan
npx vercel link --project hrflow-app --yes | Out-Null
npx vercel env pull $EnvFile --environment=production --yes

$skipPattern = '^(VERCEL_|NX_|TURBO_)'
$keys = Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^([^#=]+)=') { $matches[1] }
} | Where-Object { $_ -and $_ -notmatch $skipPattern } | Sort-Object -Unique

Write-Host ""
Write-Host "Keys pulled ($($keys.Count)):" -ForegroundColor Yellow
$keys | ForEach-Object { Write-Host "  - $_" }

Write-Host ""
Write-Host "=== 2. Sync secrets via production runtime (Sensitive vars are write-only in CLI) ===" -ForegroundColor Cyan

if (-not (Test-Path $AuthFile)) {
  throw "Vercel auth not found. Run: npx vercel login"
}
$vercelToken = (Get-Content $AuthFile -Raw | ConvertFrom-Json).token

$headers = @{
  "X-Vercel-Token" = $vercelToken
  "Content-Type"   = "application/json"
}

try {
  $sync = Invoke-RestMethod -Uri "$ProdUrl/api/cron/sync-deploy-env" -Method POST -Headers $headers -TimeoutSec 120
} catch {
  $resp = $_.ErrorDetails.Message
  if ($resp) { Write-Host $resp }
  throw "Sync failed. Deploy hrflow-app with sync-deploy-env route first: npx vercel deploy --prod"
}

Write-Host ""
foreach ($r in $sync.results) {
  Write-Host "Project: $($r.project) (profile=$($r.profile))" -ForegroundColor Green
  Write-Host "  Copied ($($r.copied.Count)): $($r.copied -join ', ')"
  if ($r.skipped.Count -gt 0) {
    Write-Host "  Skipped empty ($($r.skipped.Count)): $($r.skipped -join ', ')" -ForegroundColor DarkYellow
  }
  if ($r.errors.Count -gt 0) {
    Write-Host "  Errors:" -ForegroundColor Red
    $r.errors | ForEach-Object { Write-Host "    $($_.key): $($_.message)" }
  }
}

Write-Host ""
Write-Host "=== 3. Verify env counts (production) ===" -ForegroundColor Cyan

function Get-ProdEnvCount($project) {
  npx vercel link --project $project --yes | Out-Null
  $out = npx vercel env ls production 2>&1 | Out-String
  $count = ([regex]::Matches($out, '(?m)^\s+\S+\s+Encrypted|\s+Plain')).Count
  if ($count -eq 0) {
    $count = ([regex]::Matches($out, '(?m)^\s+[A-Z0-9_]+\s+')).Count
  }
  return $count
}

$appCount = Get-ProdEnvCount "hrflow-app"
$hrCount = Get-ProdEnvCount "hrflow-hr"
$legalCount = Get-ProdEnvCount "hrflow-legal"

Write-Host "  hrflow-app:    $appCount vars"
Write-Host "  hrflow-hr:     $hrCount vars (expected $($appCount + 1) incl. DEPLOY_PROFILE)"
Write-Host "  hrflow-legal:  $legalCount vars (expected $($appCount + 1) incl. DEPLOY_PROFILE)"

$verifyOk = ($hrCount -eq $appCount + 1) -and ($legalCount -eq $appCount + 1)
if ($verifyOk) {
  Write-Host "Verify: PASS" -ForegroundColor Green
} else {
  Write-Host "Verify: MISMATCH - check Dashboard or re-run sync" -ForegroundColor Red}

Write-Host ""
Write-Host "=== 4. Cleanup .env.hrflow-app ===" -ForegroundColor Cyan
if (Test-Path $EnvFile) {
  Remove-Item $EnvFile -Force
  Write-Host "Deleted $EnvFile"
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green
