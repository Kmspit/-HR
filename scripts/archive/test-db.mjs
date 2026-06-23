import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env') })

import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN
const prisma = url && token
  ? new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: token }) })
  : new PrismaClient()

try {
  const users = await prisma.user.count()
  const settings = await prisma.companySettings.findUnique({ where: { id: 'singleton' } })
  console.log('users:', users, 'settings:', settings ? 'ok' : 'MISSING')
} catch (e) {
  console.error('DB ERROR:', e.message)
} finally {
  await prisma.$disconnect()
}
