/**
 * One-off seed: เพิ่มบริษัทลูกค้า (ClientCompany) 7 รายชื่อที่ระบุไว้
 * Run: npx tsx scripts/seed-client-companies.ts
 */
import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env') })
config({ path: resolve(process.cwd(), '.env.local') })

function makePrisma() {
  const url = process.env.TURSO_DATABASE_URL
  const token = process.env.TURSO_AUTH_TOKEN
  if (url && token) {
    console.log('Using Turso:', url)
    return new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: token }) })
  }
  console.log('Using local SQLite')
  return new PrismaClient()
}

const prisma = makePrisma()

const COMPANY_NAMES = [
  'บริษัท บาร์เกน พ้อยท์ จำกัด (BPL)',
  'บริษัท พี เอส ที จี จำกัด',
  'บริษัท พินนะเคิล จำกัด',
  'Chayo',
  'บริษัท เวนเจอร์ฯ',
  'บริษัท อินนีเชียลฯ',
  'บริษัท IFS แคปปิตอล จำกัด (มหาชน)',
]

async function nextClientCode(year: number): Promise<string> {
  const prefix = `CLT-${year}-`
  const rows = await prisma.clientCompany.findMany({
    where: { clientCode: { startsWith: prefix } },
    select: { clientCode: true },
  })
  let max = 0
  for (const row of rows) {
    const n = Number(row.clientCode.slice(prefix.length))
    if (Number.isFinite(n) && n > max) max = n
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

async function main() {
  const creator = await prisma.user.findFirst({
    where: { role: { in: ['CEO', 'SUPER_ADMIN'] }, status: 'ACTIVE' },
    select: { id: true, email: true, role: true },
    orderBy: { createdAt: 'asc' },
  })
  if (!creator) {
    console.error('ไม่พบ user role CEO หรือ SUPER_ADMIN ในระบบ — หยุดทำงาน (ไม่เดา userId)')
    process.exit(1)
  }
  console.log(`ใช้ createdById = ${creator.id} (${creator.email}, ${creator.role})`)

  const year = new Date().getFullYear()
  const created: { clientCode: string; companyName: string }[] = []
  const skipped: { companyName: string; reason: string }[] = []

  for (const companyName of COMPANY_NAMES) {
    const existing = await prisma.clientCompany.findFirst({
      where: { companyName: { equals: companyName } },
      select: { clientCode: true, companyName: true },
    })
    if (existing) {
      skipped.push({ companyName, reason: `มีอยู่แล้ว (${existing.clientCode})` })
      continue
    }

    const clientCode = await nextClientCode(year)
    const company = await prisma.clientCompany.create({
      data: {
        clientCode,
        companyName,
        clientType: 'CORPORATE',
        status: 'ACTIVE',
        createdById: creator.id,
        contactName: null,
        phone: null,
        email: null,
        address: null,
        taxId: null,
        note: null,
      },
      select: { clientCode: true, companyName: true },
    })
    created.push(company)
    console.log(`✅ ${company.clientCode}  ${company.companyName}`)
  }

  console.log('\n=== สรุป ===')
  console.log(`สร้างสำเร็จ: ${created.length}`)
  created.forEach((c) => console.log(`  ${c.clientCode}  ${c.companyName}`))
  if (skipped.length) {
    console.log(`ข้าม (ซ้ำ): ${skipped.length}`)
    skipped.forEach((s) => console.log(`  ${s.companyName} — ${s.reason}`))
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
