import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { DEFAULT_COMPANY_BRANCHES } from '../lib/company-branches'
import { seedDefaultOrgStructure } from '../lib/default-org-structure'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env from project root
config({ path: resolve(process.cwd(), '.env') })

function makePrisma() {
  const url   = process.env.TURSO_DATABASE_URL
  const token = process.env.TURSO_AUTH_TOKEN
  if (url && token) {
    console.log('Using Turso:', url)
    const adapter = new PrismaLibSQL({ url, authToken: token })
    return new PrismaClient({ adapter })
  }
  console.log('Using local SQLite')
  return new PrismaClient()
}

const prisma = makePrisma()

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

  console.log('✅ Seeding complete!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
