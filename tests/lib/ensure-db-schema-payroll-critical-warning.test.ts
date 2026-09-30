import { readFileSync } from 'fs'
import { describe, it, expect } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '@/lib/ensure-db-schema'

const source = readFileSync('lib/ensure-db-schema.ts', 'utf8')
const schema = readFileSync('prisma/schema.prisma', 'utf8')

describe('Payroll note/warning severity separation (2026-09-30) — schema migration v900044', () => {
  it('bumps CURRENT_SCHEMA_VERSION to v900044', () => {
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(900044)
  })

  it('adds payrolls.criticalWarning idempotently via the existing addPayrollColumnIfMissing helper', () => {
    expect(source).toMatch(/addPayrollColumnIfMissing\('criticalWarning',\s*`ALTER TABLE payrolls ADD COLUMN criticalWarning/)
  })

  it('runs the v900044 statement before markSchemaVersionApplied (part of every ensure run)', () => {
    const newStatementPos = source.indexOf(`addPayrollColumnIfMissing('criticalWarning'`)
    const markAppliedPos = source.indexOf('await markSchemaVersionApplied()')
    expect(newStatementPos).toBeGreaterThan(-1)
    expect(markAppliedPos).toBeGreaterThan(-1)
    expect(newStatementPos).toBeLessThan(markAppliedPos)
  })

  it('schema.prisma declares Payroll.criticalWarning as a separate nullable field from note', () => {
    const model = schema.match(/model Payroll \{[\s\S]*?\n\}/)
    expect(model, 'Payroll model not found in schema.prisma').not.toBeNull()
    const body = model![0]
    expect(body).toMatch(/\bcriticalWarning\s+String\?/)
    expect(body).toMatch(/\bnote\s+String\?/)
  })
})
