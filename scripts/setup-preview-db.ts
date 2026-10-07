/**
 * ตั้งค่า DB ของ Vercel Preview (hrflow-preview) — สร้างตารางทั้งหมด + ข้อมูลทดสอบขั้นต่ำ
 * ห้ามใช้กับ production: สคริปต์หยุดทันทีถ้า hostname ไม่ขึ้นต้นด้วย "hrflow-preview-"
 * (กันกรณีเผลอส่ง ~/.hrflow-prod.env เข้ามา แม้จะพิมพ์ชื่อ DB ยืนยันผ่านแล้วก็ตาม)
 *
 * ขั้นตอน (รันซ้ำได้ — idempotent):
 *   1. DB ว่าง (ยังไม่มีตาราง users) → สร้างตารางทั้งหมดจาก prisma/schema.prisma
 *      (`prisma migrate diff --from-empty`) — ensureDbSchema สร้างได้แค่บางตาราง
 *   2. ensureDbSchema({ force: true }) — คอลัมน์/index เพิ่มเติม + โครงสร้างองค์กร
 *   3. สาขา HQ/NMA + company settings ชื่อ "HRFlow PREVIEW" (ไม่ใช่ข้อมูลบริษัทจริง)
 *   4. user ทดสอบ 4 role (@preview.test) — สุ่มรหัสผ่านใหม่ทุกครั้งที่รัน
 *      เก็บไว้ที่ ~/.hrflow-preview-users.txt (นอก repo)
 *   5. approval chain ค่าเริ่มต้น 4 ชุด (ต้องมี user ACTIVE ระดับ admin ก่อน)
 *
 * Usage (PowerShell):
 *   node --env-file=$HOME\.hrflow-preview.env node_modules/tsx/dist/cli.mjs scripts/setup-preview-db.ts --prod
 */
import { execFileSync } from 'child_process'
import { randomBytes } from 'crypto'
import { writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { loadLocalEnv, requireProdTarget } from './lib/prod-guard.mjs'

loadLocalEnv()

const PREVIEW_HOST_PREFIX = 'hrflow-preview-'

const TEST_USERS = [
  { key: 'ceo', role: 'CEO', name: 'ทดสอบ ซีอีโอ (Preview)', employeeId: 'PV-0001', position: 'CEO' },
  { key: 'managerhr', role: 'MANAGER_HR', name: 'ทดสอบ ผู้จัดการ HR (Preview)', employeeId: 'PV-0002', position: 'HR Manager' },
  { key: 'hr', role: 'HR', name: 'ทดสอบ เจ้าหน้าที่ HR (Preview)', employeeId: 'PV-0003', position: 'HR Officer' },
  { key: 'employee', role: 'EMPLOYEE', name: 'ทดสอบ พนักงาน (Preview)', employeeId: 'PV-0004', position: 'Staff' },
] as const

async function main() {
  const { url, authToken } = await requireProdTarget('setup-preview-db.ts')
  const host = new URL(url).hostname
  if (!host.startsWith(PREVIEW_HOST_PREFIX)) {
    console.error(`⛔ ${host} ไม่ใช่ DB ของ preview (ต้องขึ้นต้นด้วย "${PREVIEW_HOST_PREFIX}") — ไม่ได้แตะอะไรเลย`)
    process.exit(1)
  }

  // import หลัง requireProdTarget (ตั้ง ALLOW_PROD=1 ให้) — lib/prisma จะได้ไม่ถูก prod-guard บล็อก
  const { createClient } = await import('@libsql/client')
  const { prisma } = await import('../lib/prisma')
  const { ensureDbSchema, ALL_MAPPED_TABLES } = await import('../lib/ensure-db-schema')
  const { DEFAULT_COMPANY_BRANCHES, HQ_BRANCH_ID } = await import('../lib/company-branches')
  const { seedDefaultOrgStructure } = await import('../lib/default-org-structure')
  const { seedDefaultOutsideWorkChain } = await import('../lib/seed-outside-work-chain')
  const { seedDefaultLeaveChain } = await import('../lib/seed-default-leave-chain')
  const { seedDefaultWeeklyPlanChain } = await import('../lib/seed-default-weekly-plan-chain')
  const { seedDefaultForgotScanChain } = await import('../lib/seed-default-forgot-scan-chain')
  const bcrypt = (await import('bcryptjs')).default

  const db = createClient({ url, authToken })
  const tableNames = async () =>
    new Set((await db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.map((r) => String(r.name)))

  // 1. base schema
  if (!(await tableNames()).has('users')) {
    console.log('[1] DB ว่าง → สร้างตารางจาก prisma/schema.prisma')
    const sql = execFileSync(
      process.execPath,
      ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'],
      { encoding: 'utf8' },
    )
    await db.executeMultiple(sql)
  } else {
    console.log('[1] มีตาราง users อยู่แล้ว → ข้ามการสร้างตารางฐาน')
  }

  // 2. ensureDbSchema
  console.log('[2] ensureDbSchema({ force: true })')
  if (!(await ensureDbSchema({ force: true }))) throw new Error('ensureDbSchema() returned false — ดู error ด้านบน')

  // 3. branches + org + company settings
  console.log('[3] สาขา + โครงสร้างองค์กร + company settings')
  for (const b of DEFAULT_COMPANY_BRANCHES) {
    const data = { code: b.code, name: b.name, nameEn: b.nameEn, address: b.address, isActive: true, isDefault: b.id === HQ_BRANCH_ID }
    await prisma.companyBranch.upsert({ where: { id: b.id }, update: data, create: { id: b.id, ...data } })
    await seedDefaultOrgStructure(prisma, b.id)
  }
  const settings = {
    companyName: 'HRFlow PREVIEW (ข้อมูลทดสอบ)',
    companyNameEn: 'HRFlow PREVIEW (test data)',
    officeAddress: 'ที่อยู่ทดสอบ — ไม่ใช่ข้อมูลจริง',
  }
  await prisma.companySettings.upsert({ where: { id: 'singleton' }, update: settings, create: { id: 'singleton', ...settings } })

  // 4. test users
  console.log('[4] user ทดสอบ 4 role')
  const lines = [`# hrflow-preview test users — สร้างเมื่อ ${new Date().toISOString()} (ใช้กับ Preview เท่านั้น)`]
  const ids: Record<string, string> = {}
  for (const u of TEST_USERS) {
    const email = `${u.key}@preview.test`
    const password = randomBytes(9).toString('base64url')
    const passwordHash = await bcrypt.hash(password, 10)
    const data = {
      name: u.name, role: u.role, status: 'ACTIVE' as const, employeeId: u.employeeId,
      position: u.position, branchId: HQ_BRANCH_ID, passwordHash,
    }
    const row = await prisma.user.upsert({ where: { email }, update: data, create: { email, ...data }, select: { id: true } })
    ids[u.key] = row.id
    lines.push(`${u.role.padEnd(10)} ${email}  ${password}`)
  }
  // พนักงานมีหัวหน้า = ผู้จัดการ HR — ขั้น "หัวหน้า" ของ approval chain จะได้มีคนอนุมัติ
  await prisma.user.update({ where: { id: ids.employee }, data: { managerId: ids.managerhr } })
  const credFile = join(homedir(), '.hrflow-preview-users.txt')
  writeFileSync(credFile, lines.join('\n') + '\n')
  console.log(`    รหัสผ่านอยู่ที่ ${credFile}`)

  // 5. approval chains
  console.log('[5] approval chain ค่าเริ่มต้น')
  await seedDefaultOutsideWorkChain(prisma)
  await seedDefaultLeaveChain(prisma)
  await seedDefaultWeeklyPlanChain(prisma)
  await seedDefaultForgotScanChain(prisma)

  // summary
  const existing = await tableNames()
  // case_templates: ตารางเก่าที่ไม่มี Prisma model แล้ว (มีแค่ใน prod) — แอปไม่ใช้
  const missing = ALL_MAPPED_TABLES.filter((t) => t !== 'case_templates' && !existing.has(t))
  const chains = await prisma.approvalChainConfig.findMany({ select: { entityType: true, isDefault: true } })
  console.log('\n── สรุป ──')
  console.log('host:', host)
  console.log('ตาราง:', existing.size, '| ขาด:', missing.length ? missing.join(', ') : 'ไม่มี')
  console.log('สาขา:', await prisma.companyBranch.count(), '| ฝ่าย:', await prisma.division.count(), '| แผนก:', await prisma.department.count())
  console.log('users:', await prisma.user.count(), '| chains:', chains.map((c) => c.entityType + (c.isDefault ? '*' : '')).join(', '))
  await prisma.$disconnect()
  if (missing.length) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
