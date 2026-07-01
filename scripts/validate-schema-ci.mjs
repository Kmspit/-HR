#!/usr/bin/env node
/**
 * CI static check: Prisma schema + ensure-db-schema coexistence.
 * Fails if critical models are missing from schema.prisma.
 */
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const schemaPath = path.join(root, 'prisma', 'schema.prisma')
const ensurePath = path.join(root, 'lib', 'ensure-db-schema.ts')

if (!fs.existsSync(schemaPath)) {
  console.error('[schema-ci] missing prisma/schema.prisma')
  process.exit(1)
}
if (!fs.existsSync(ensurePath)) {
  console.error('[schema-ci] missing lib/ensure-db-schema.ts')
  process.exit(1)
}

const schema = fs.readFileSync(schemaPath, 'utf8')
const models = [...schema.matchAll(/^model (\w+)/gm)].map((m) => m[1])

const required = [
  'User',
  'LeaveRequest',
  'Payroll',
  'Warning',
  'ApprovalRequest',
  'ForgotScanRequest',
  'DocumentRequest',
]

const missing = required.filter((m) => !models.includes(m))
if (missing.length > 0) {
  console.error('[schema-ci] missing required models:', missing.join(', '))
  process.exit(1)
}

console.log(`[schema-ci] OK — ${models.length} models, ensure-db-schema present`)
console.log('[schema-ci] note: production uses prisma db push + ensure-db-schema cron; prefer consolidating to Prisma migrate long-term')
