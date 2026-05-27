import { prisma } from '@/lib/prisma'

const HQ_ID = 'branch-hq-kmsp'
const NMA_ID = 'branch-nma-korat'

let ensurePromise: Promise<boolean> | null = null

/** Idempotent Turso/SQLite patches — safe to call on every cold start */
export async function ensureDbSchema(): Promise<boolean> {
  if (!process.env.TURSO_DATABASE_URL) return true
  if (!ensurePromise) {
    ensurePromise = runEnsure().catch((err) => {
      ensurePromise = null
      console.error('[ensureDbSchema]', err)
      return false
    })
  }
  return ensurePromise
}

async function userColumns(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>('PRAGMA table_info(users)')
  return rows.map((r) => r.name)
}

async function addUserColumnIfMissing(column: string, ddl: string) {
  const cols = await userColumns()
  if (cols.includes(column)) return
  try {
    await prisma.$executeRawUnsafe(ddl)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('duplicate column')) throw err
  }
}

async function runEnsure(): Promise<boolean> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS company_branches (
      id TEXT NOT NULL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      nameEn TEXT,
      address TEXT,
      phone TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      isDefault INTEGER NOT NULL DEFAULT 0,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await addUserColumnIfMissing('branchId', `ALTER TABLE users ADD COLUMN branchId TEXT`)
  await addUserColumnIfMissing(
    'profileImageBase64',
    `ALTER TABLE users ADD COLUMN profileImageBase64 TEXT`,
  )

  await prisma.$executeRaw`
    INSERT OR IGNORE INTO company_branches (id, code, name, nameEn, address, isActive, isDefault, createdAt, updatedAt)
    VALUES (${HQ_ID}, 'HQ', 'สำนักงานใหญ่', 'Head Office', 'กรุงเทพมหานคร', 1, 1, datetime('now'), datetime('now'))
  `
  await prisma.$executeRaw`
    INSERT OR IGNORE INTO company_branches (id, code, name, nameEn, address, isActive, isDefault, createdAt, updatedAt)
    VALUES (${NMA_ID}, 'NMA', 'สาขานครราชสีมา', 'Nakhon Ratchasima Branch', 'จังหวัดนครราชสีมา', 1, 0, datetime('now'), datetime('now'))
  `
  await prisma.$executeRaw`
    UPDATE users SET branchId = ${HQ_ID} WHERE branchId IS NULL OR branchId = ''
  `

  return true
}
