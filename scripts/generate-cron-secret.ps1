# ASCII-only secret for Vercel CRON_SECRET (no Thai / no emoji)
$secret = -join ((48..57 + 65..90 + 97..122 | Get-Random -Count 48 | ForEach-Object { [char]$_ }))
Write-Host ""
Write-Host "Copy this value into Vercel -> Environment Variables -> CRON_SECRET"
Write-Host ""
Write-Host $secret
Write-Host ""
