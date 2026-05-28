import { prisma } from '@/lib/prisma'
import { DEFAULT_COMPANY_BRANCHES, HQ_BRANCH_ID, NMA_BRANCH_ID } from '@/lib/company-branches'
import { seedDefaultOrgStructure } from '@/lib/default-org-structure'

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

  for (const b of DEFAULT_COMPANY_BRANCHES) {
    await prisma.$executeRaw`
      INSERT OR IGNORE INTO company_branches (id, code, name, nameEn, address, isActive, isDefault, createdAt, updatedAt)
      VALUES (${b.id}, ${b.code}, ${b.name}, ${b.nameEn}, ${b.address}, 1, ${b.isDefault ? 1 : 0}, datetime('now'), datetime('now'))
    `
    await prisma.$executeRaw`
      UPDATE company_branches
      SET code = ${b.code}, name = ${b.name}, nameEn = ${b.nameEn}, address = ${b.address},
          isActive = 1, isDefault = ${b.isDefault ? 1 : 0}, updatedAt = datetime('now')
      WHERE id = ${b.id}
    `
  }

  const hqId = DEFAULT_COMPANY_BRANCHES[0].id
  await prisma.$executeRaw`
    UPDATE users SET branchId = ${hqId} WHERE branchId IS NULL OR branchId = ''
  `

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS divisions (
      id TEXT NOT NULL PRIMARY KEY,
      branchId TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      nameEn TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(branchId, code)
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS departments (
      id TEXT NOT NULL PRIMARY KEY,
      branchId TEXT NOT NULL,
      divisionId TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      nameEn TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(divisionId, code)
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS sections (
      id TEXT NOT NULL PRIMARY KEY,
      branchId TEXT NOT NULL,
      departmentId TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      nameEn TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(departmentId, code)
    )
  `)

  await addUserColumnIfMissing('divisionId', `ALTER TABLE users ADD COLUMN divisionId TEXT`)
  await addUserColumnIfMissing('departmentId', `ALTER TABLE users ADD COLUMN departmentId TEXT`)
  await addUserColumnIfMissing('sectionId', `ALTER TABLE users ADD COLUMN sectionId TEXT`)

  for (const branchId of [HQ_BRANCH_ID, NMA_BRANCH_ID]) {
    try {
      await seedDefaultOrgStructure(prisma, branchId)
    } catch (err) {
      console.warn('[ensureDbSchema] org seed', branchId, err)
    }
  }

  return true
}
