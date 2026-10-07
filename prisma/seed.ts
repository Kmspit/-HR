import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { DEFAULT_COMPANY_BRANCHES } from '../lib/company-branches'
import { seedDefaultOrgStructure } from '../lib/default-org-structure'
import { loadLocalEnv, resolveDbTarget } from '../scripts/lib/prod-guard.mjs'

loadLocalEnv()

// ไม่ใส่ --prod → local prisma/prisma/dev.db เสมอ (ดู scripts/lib/prod-guard.mjs)
let prisma!: PrismaClient
async function connectDb() {
  const prod = await resolveDbTarget('seed.ts')
  console.log(prod ? `Using Turso (PRODUCTION): ${prod.url}` : 'Using local SQLite')
  prisma = prod
    ? new PrismaClient({ adapter: new PrismaLibSQL({ url: prod.url, authToken: prod.authToken }) })
    : new PrismaClient()
}

async function main() {
  console.log('🌱 Seeding database...')

  const [hqDef, nmaDef] = DEFAULT_COMPANY_BRANCHES
  const hq = await prisma.companyBranch.upsert({
    where: { id: hqDef.id },
    update: {
      code: hqDef.code,
      name: hqDef.name,
      nameEn: hqDef.nameEn,
      address: hqDef.address,
      isActive: true,
      isDefault: true,
    },
    create: {
      id: hqDef.id,
      code: hqDef.code,
      name: hqDef.name,
      nameEn: hqDef.nameEn,
      address: hqDef.address,
      isActive: true,
      isDefault: true,
    },
  })
  const nma = await prisma.companyBranch.upsert({
    where: { id: nmaDef.id },
    update: {
      code: nmaDef.code,
      name: nmaDef.name,
      nameEn: nmaDef.nameEn,
      address: nmaDef.address,
      isActive: true,
      isDefault: false,
    },
    create: {
      id: nmaDef.id,
      code: nmaDef.code,
      name: nmaDef.name,
      nameEn: nmaDef.nameEn,
      address: nmaDef.address,
      isActive: true,
      isDefault: false,
    },
  })
  console.log(`✅ Branches: ${hq.code}, ${nma.code}`)

  for (const b of [hq, nma]) {
    const org = await seedDefaultOrgStructure(prisma, b.id)
    console.log(`✅ Org ${b.code}: ${org.divisions} ฝ่าย, ${org.departments} แผนก, ${org.sections} ส่วนงาน`)
  }

  // Company settings — KM Serviceplus
  await prisma.companySettings.upsert({
    where: { id: 'singleton' },
    update: {
      companyName: 'บริษัท เค เอ็ม เซอร์วิส พลัส จำกัด',
      companyNameEn: 'KM Service Plus Co., Ltd.',
      officeAddress: '16 ซอย รามอินทรา 93 แขวงคันนายาว เขตคันนายาว กรุงเทพมหานคร 10230',
      geofenceLat: 13.82965,
      geofenceLng: 100.67712,
      geofenceRadius: 200,
    },
    create: {
      id: 'singleton',
      companyName: 'บริษัท เค เอ็ม เซอร์วิส พลัส จำกัด',
      companyNameEn: 'KM Service Plus Co., Ltd.',
      officeAddress: '16 ซอย รามอินทรา 93 แขวงคันนายาว เขตคันนายาว กรุงเทพมหานคร 10230',
      geofenceLat: 13.82965,
      geofenceLng: 100.67712,
      geofenceRadius: 200,
      workStartTime: '08:30',
      workEndTime: '17:30',
      lateGraceMin: 15,
      sickDaysYear: 30,
      vacationDaysYear: 6,
      personalDaysYear: 3,
    },
  })

  // Demo accounts (manager/admin/employee/lawyer @demo.com, fixed password
  // 'demo1234') were seeded here via upsert-by-email. Removed 2026-08-31,
  // pre-pilot-launch: this project has no separate dev database — `npm run
  // dev` and this script both connect to the same live Turso DB as
  // production — so running this script would silently overwrite the
  // passwordHash/status/role of whatever real account currently holds one
  // of these four email addresses back to the fixed demo password. Do not
  // re-add this without a dev-only DB to scope it to.

  console.log('✅ Seeding complete!')
}

connectDb()
  .then(main)
  .catch(console.error)
  .finally(() => prisma?.$disconnect())
