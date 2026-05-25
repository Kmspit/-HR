import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env') })

const url   = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN
console.log('URL:', url)
console.log('Token len:', token?.length, 'start:', token?.substring(0,20))

// Test direct connection
import { createClient } from '@libsql/client'
const db = createClient({ url, authToken: token })
try {
  const r = await db.execute("SELECT 1 as ok")
  console.log('Direct libsql OK:', r.rows[0])
} catch(e) {
  console.error('Direct libsql ERR:', e.message)
}

// Test PrismaLibSQL
import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
const adapter = new PrismaLibSQL({ url, authToken: token })
const prisma  = new PrismaClient({ adapter })
try {
  const count = await prisma.user.count()
  console.log('Prisma user count:', count)
} catch(e) {
  console.error('Prisma ERR:', e.message?.substring(0,120))
}
