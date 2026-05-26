/**
 * ปิด process ค้างบนพอร์ต 3000–3002 แล้วรัน Next.js แค่พอร์ตเดียว
 * npm run dev        → รันปกติ
 * npm run dev:reset  → ลบ .next แล้วรัน (แก้ layout.css 404)
 */
import { rmSync, existsSync } from 'fs'
import { spawn, execSync } from 'child_process'
import { platform, networkInterfaces } from 'os'

const PORTS = [3000, 3001, 3002]
const cleanNext = process.argv.includes('--clean')

function killPorts() {
  console.log('Stopping old dev servers on ports', PORTS.join(', '), '...')
  try {
    if (platform() === 'win32') {
      const ports = PORTS.join(',')
      execSync(
        `powershell -NoProfile -Command "$ports = @(${ports}); foreach ($p in $ports) { Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"`,
        { stdio: 'ignore' },
      )
    } else {
      for (const port of PORTS) {
        try {
          execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { shell: true, stdio: 'ignore' })
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    console.warn('(could not free all ports — continuing)')
  }
}

if (cleanNext) {
  const nextDir = '.next'
  if (existsSync(nextDir)) {
    rmSync(nextDir, { recursive: true, force: true })
    console.log('Removed .next')
  }
}

killPorts()

function lanUrls(port) {
  const urls = []
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) urls.push(`http://${ni.address}:${port}`)
    }
  }
  return [...new Set(urls)]
}

const port = '3000'
const network = lanUrls(port)

console.log('')
console.log('  HR KM Serviceplus — dev server')
console.log('  This PC:     http://localhost:' + port)
if (network.length) {
  console.log('  Other devices (same Wi‑Fi/LAN):')
  network.forEach((u) => console.log('    ' + u))
} else {
  console.log('  Other devices: run ipconfig → use IPv4 + :' + port)
}
console.log('  Login: employee@demo.com / demo1234')
console.log('  If blocked: allow port ' + port + ' in Windows Firewall (see README)')
console.log('')

const child = spawn('npx', ['next', 'dev', '-p', port, '-H', '0.0.0.0'], {
  stdio: 'inherit',
  cwd: process.cwd(),
  shell: true,
})

child.on('exit', (code) => process.exit(code ?? 0))
