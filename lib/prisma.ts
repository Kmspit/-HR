import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

function createPrismaClient() {
  const url   = process.env.TURSO_DATABASE_URL
  const token = process.env.TURSO_AUTH_TOKEN

  if (url && token) {
    const adapter = new PrismaLibSQL({ url, authToken: token })
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    })
  }

  // Fallback: local SQLite
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
