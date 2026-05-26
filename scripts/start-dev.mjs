/**
 * ปิด process ค้างบนพอร์ต 3000–3002 แล้วรัน Next.js แค่พอร์ตเดียว
 * npm run dev        → รันปกติ
 * npm run dev:reset  → ลบ .next แล้วรัน (แก้ layout.css 404)
 */
import { rmSync, existsSync } from 'fs'
import { spawn, execSync } from 'child_process'
import { platform } from 'os'

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

console.log('')
console.log('  HR KM Serviceplus — dev server')
console.log('  Open: http://localhost:3000')
console.log('  Login: employee@demo.com / demo1234')
console.log('')

const child = spawn('npx', ['next', 'dev', '-p', '3000'], {
  stdio: 'inherit',
  cwd: process.cwd(),
  shell: true,
})

child.on('exit', (code) => process.exit(code ?? 0))
