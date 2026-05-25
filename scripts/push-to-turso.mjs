// Script: push Prisma schema to Turso
import { createClient } from '@libsql/client'
import { spawnSync } from 'child_process'
import { readFileSync } from 'fs'

// Load .env manually
const envFile = readFileSync('.env', 'utf8')
const envVars = {}
for (const line of envFile.split('\n')) {
  const match = line.match(/^([^#=]+)=["']?(.+?)["']?\s*$/)
  if (match) envVars[match[1].trim()] = match[2].trim()
}

const TURSO_URL   = envVars.TURSO_DATABASE_URL
const TURSO_TOKEN = envVars.TURSO_AUTH_TOKEN

console.log('Connecting to Turso:', TURSO_URL)
const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })

// Test connection
const r0 = await db.execute("SELECT name FROM sqlite_master WHERE type='table'")
const tables = r0.rows.map(row => row.name)
console.log('Existing tables:', tables.length ? tables.join(', ') : '(none)')
if (tables.length >= 10) {
  console.log('✅ Database already set up')
  process.exit(0)
}

// Generate SQL
const result = spawnSync(
  'node_modules\\.bin\\prisma.cmd',
  ['migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'],
  { encoding: 'utf8', shell: true, env: { ...process.env, DATABASE_URL: 'file:./prisma/dev.db' } }
)

const rawSql = (result.stdout?.trim() ? result.stdout : result.stderr) || ''
console.log(`Got ${rawSql.length} chars of SQL`)

// Remove comment lines, then split by semicolons
const cleanSql = rawSql
  .split('\n')
  .filter(line => !line.trim().startsWith('--') && !line.trim().startsWith('warn') && !line.includes('pris.ly'))
  .join('\n')

const statements = cleanSql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 10)

console.log(`Pushing ${statements.length} statements...\n`)

let success = 0, skipped = 0
for (const stmt of statements) {
  try {
    await db.execute(stmt)
    success++
    process.stdout.write('.')
  } catch (err) {
    if (err.message?.includes('already exists') || err.message?.includes('duplicate')) {
      skipped++
      process.stdout.write('s')
    } else {
      console.warn('\n⚠', stmt.substring(0, 50), '->', err.message?.substring(0, 80))
      skipped++
    }
  }
}

console.log(`\n\n✅ Done — ${success} tables created, ${skipped} skipped`)
process.exit(0)
