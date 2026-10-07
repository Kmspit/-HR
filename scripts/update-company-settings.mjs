import { loadLocalEnv, resolveDbTarget } from './lib/prod-guard.mjs'
import { resolve } from 'path'
import { createClient } from '@libsql/client'
import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

loadLocalEnv()

const data = {
  companyName: 'บริษัท เค เอ็ม เซอร์วิส พลัส จำกัด',
  companyNameEn: 'KM Service Plus Co., Ltd.',
  officeAddress:
    '16 ซอย รามอินทรา 93 แขวงคันนายาว เขตคันนายาว กรุงเทพมหานคร 10230',
  geofenceLat: 13.8253,
  geofenceLng: 100.6785,
  geofenceRadius: 250,
}

const { url, authToken: token } = (await resolveDbTarget('update-company-settings.mjs')) ?? {}

if (url && token) {
  const db = createClient({ url, authToken: token })
  try {
    await db.execute(`ALTER TABLE company_settings ADD COLUMN officeAddress TEXT`)
  } catch {
    /* exists */
  }
}

const prisma =
  url && token
    ? new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: token }) })
    : new PrismaClient()

await prisma.companySettings.upsert({
  where: { id: 'singleton' },
  update: data,
  create: { id: 'singleton', workStartTime: '08:30', workEndTime: '17:30', lateGraceMin: 15, ...data },
})
console.log('Updated:', data.companyName)
await prisma.$disconnect()
