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
