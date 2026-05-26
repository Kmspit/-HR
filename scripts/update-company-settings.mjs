import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@libsql/client'
import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

const data = {
  companyName: 'บริษัท เค เอ็ม เซอร์วิส พลัส จำกัด',
  companyNameEn: 'KM Service Plus Co., Ltd.',
  officeAddress:
    '16 ซอย รามอินทรา 93 แขวงคันนายาว เขตคันนายาว กรุงเทพมหานคร 10230',
  geofenceLat: 13.8253,
  geofenceLng: 100.6785,
  geofenceRadius: 250,
}

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN

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
