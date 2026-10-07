/**
 * Seed โครงสร้างฝ่าย/แผนก/ส่วนงานมาตรฐาน (HQ + NMA)
 * Run: npm run db:seed:org
 */
import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { loadLocalEnv, resolveDbTarget } from './lib/prod-guard.mjs'
import { DEFAULT_COMPANY_BRANCHES } from '../lib/company-branches'
import { seedDefaultOrgStructure } from '../lib/default-org-structure'

loadLocalEnv()

// ไม่ใส่ --prod → local prisma/prisma/dev.db เสมอ (ดู scripts/lib/prod-guard.mjs)
let prisma!: PrismaClient
async function connectDb() {
  const prod = await resolveDbTarget('seed-org-structure.ts')
  console.log(prod ? `Using Turso (PRODUCTION): ${prod.url}` : 'Using local SQLite')
  prisma = prod
    ? new PrismaClient({ adapter: new PrismaLibSQL({ url: prod.url, authToken: prod.authToken }) })
    : new PrismaClient()
}

async function main() {
  console.log('🌱 Seeding default org structure...')
  for (const branch of DEFAULT_COMPANY_BRANCHES) {
    const exists = await prisma.companyBranch.findUnique({ where: { id: branch.id } })
    if (!exists) {
      console.warn(`Skip ${branch.code}: branch not found (${branch.id})`)
      continue
    }
    const counts = await seedDefaultOrgStructure(prisma, branch.id)
    console.log(
      `✅ ${branch.code} (${branch.name}): ${counts.divisions} ฝ่าย, ${counts.departments} แผนก, ${counts.sections} ส่วนงาน`,
    )
  }
  console.log('Done.')
}

connectDb()
  .then(main)
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma?.$disconnect())
