import { readFileSync } from 'fs'
import { describe, it, expect } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '@/lib/ensure-db-schema'

const source = readFileSync('lib/ensure-db-schema.ts', 'utf8')
const schema = readFileSync('prisma/schema.prisma', 'utf8')

const NEW_EMPLOYEE_PROFILE_COLUMNS = [
  'bloodType', 'fatherName', 'fatherOccupation', 'motherName', 'motherOccupation',
  'siblingsTotal', 'siblingsOrder', 'educationLevel', 'educationInstitution',
  'educationMajor', 'educationGraduationYear', 'specialSkills', 'workHistoryText',
]

describe('HR-editable employee-fields batch (2026-09-22) — Phase 0 schema', () => {
  it('bumps CURRENT_SCHEMA_VERSION to v900041', () => {
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(900041)
  })

  it('adds all 13 new employee_profiles columns idempotently', () => {
    for (const col of NEW_EMPLOYEE_PROFILE_COLUMNS) {
      const re = new RegExp(`addEmployeeProfileColumnIfMissing\\('${col}',\\s*\`ALTER TABLE employee_profiles ADD COLUMN ${col}`)
      expect(source, `expected an addEmployeeProfileColumnIfMissing call for ${col}`).toMatch(re)
    }
  })

  it('does not create a separate work_histories table (workHistoryText is a single free-text column instead)', () => {
    expect(source).not.toMatch(/CREATE TABLE IF NOT EXISTS work_histories/)
    expect(schema).not.toMatch(/model WorkHistory/)
  })

  it('runs the new v900041 statements before markSchemaVersionApplied (part of every ensure run)', () => {
    const newStatementPos = source.indexOf(`addEmployeeProfileColumnIfMissing('bloodType'`)
    const markAppliedPos = source.indexOf('await markSchemaVersionApplied()')
    expect(newStatementPos).toBeGreaterThan(-1)
    expect(markAppliedPos).toBeGreaterThan(-1)
    expect(newStatementPos).toBeLessThan(markAppliedPos)
  })

  it('schema.prisma declares EmployeeProfile fields matching every new employee_profiles column', () => {
    const modelMatch = schema.match(/model EmployeeProfile \{[\s\S]*?\n\}/)
    expect(modelMatch, 'EmployeeProfile model not found in schema.prisma').not.toBeNull()
    const body = modelMatch![0]
    for (const field of NEW_EMPLOYEE_PROFILE_COLUMNS) {
      expect(body, `expected field "${field}" on EmployeeProfile`).toMatch(new RegExp(`\\b${field}\\b`))
    }
  })
})

describe('v900042 cleanup — drop the orphan mustChangePassword column + work_histories table', () => {
  it('bumps CURRENT_SCHEMA_VERSION to v900042', () => {
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(900042)
  })

  it('checks work_histories exists before doing anything, then drops only when it has 0 rows, otherwise warns and skips', () => {
    expect(source).toMatch(/SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'work_histories'/)
    expect(source).toMatch(/"work_histories" already gone, skipping/)
    expect(source).toMatch(/SELECT COUNT\(\*\) AS cnt FROM work_histories/)
    expect(source).toMatch(/DROP TABLE "work_histories"/)
    expect(source).toMatch(/refusing to drop, needs a manual path instead/)
  })

  it('drops users.mustChangePassword only when every row is false, otherwise warns and skips', () => {
    expect(source).toMatch(/SELECT COUNT\(\*\) AS cnt FROM users WHERE mustChangePassword != 0/)
    expect(source).toMatch(/ALTER TABLE users DROP COLUMN mustChangePassword/)
  })

  it('neither orphan-cleanup statement ever touches a table/column with real (non-default) rows', () => {
    // Both blocks must gate the destructive statement behind a `if (count > 0)`
    // early-return/warn — i.e. the DROP only runs in the `else` branch.
    const workHistoriesBlock = source.slice(
      source.indexOf("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'work_histories'"),
      source.indexOf('SELECT COUNT(*) AS cnt FROM users WHERE mustChangePassword'),
    )
    expect(workHistoriesBlock).toMatch(/if \(count > 0\)/)
    expect(workHistoriesBlock.indexOf('if (count > 0)')).toBeLessThan(workHistoriesBlock.indexOf('DROP TABLE "work_histories"'))
  })

  it('runs the v900042 cleanup before markSchemaVersionApplied (part of every ensure run)', () => {
    const cleanupPos = source.indexOf('v900042 — cleanup')
    const markAppliedPos = source.indexOf('await markSchemaVersionApplied()')
    expect(cleanupPos).toBeGreaterThan(-1)
    expect(markAppliedPos).toBeGreaterThan(-1)
    expect(cleanupPos).toBeLessThan(markAppliedPos)
  })

  it('schema.prisma no longer declares User.mustChangePassword or model WorkHistory', () => {
    const userModel = schema.match(/model User \{[\s\S]*?\n\}/)
    expect(userModel, 'User model not found in schema.prisma').not.toBeNull()
    expect(userModel![0]).not.toMatch(/\bmustChangePassword\b/)
    expect(schema).not.toMatch(/model WorkHistory/)
  })
})
