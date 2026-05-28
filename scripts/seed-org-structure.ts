/**
 * Seed โครงสร้างฝ่าย/แผนก/ส่วนงานมาตรฐาน (HQ + NMA)
 * Run: npm run db:seed:org
 */
import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { config } from 'dotenv'
import { resolve } from 'path'
import { DEFAULT_COMPANY_BRANCHES } from '../lib/company-branches'
import { seedDefaultOrgStructure } from '../lib/default-org-structure'

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

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
