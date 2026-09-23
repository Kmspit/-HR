import { readFileSync } from 'fs'
import { describe, it, expect } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '@/lib/ensure-db-schema'

const source = readFileSync('lib/ensure-db-schema.ts', 'utf8')
const schema = readFileSync('prisma/schema.prisma', 'utf8')

describe('Excel backdated-attendance import (2026-09-23) — schema migration v900043', () => {
  it('bumps CURRENT_SCHEMA_VERSION to v900043', () => {
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(900043)
  })

  it('adds attendances.importBatchId idempotently', () => {
    expect(source).toMatch(/addAttendanceColumnIfMissing\('importBatchId',\s*`ALTER TABLE attendances ADD COLUMN importBatchId/)
  })

  it('creates the attendance_import_batches table and its indexes idempotently (IF NOT EXISTS)', () => {
    expect(source).toMatch(/CREATE TABLE IF NOT EXISTS attendance_import_batches/)
    expect(source).toMatch(/CREATE INDEX IF NOT EXISTS attendance_import_batches_uploadedById_idx ON attendance_import_batches \(uploadedById\)/)
    expect(source).toMatch(/CREATE INDEX IF NOT EXISTS attendances_importBatchId_idx ON attendances \(importBatchId\)/)
  })

  it('lists attendance_import_batches in ALL_MAPPED_TABLES', () => {
    expect(source).toMatch(/'attendance_import_batches'/)
  })

  it('runs the v900043 statements before markSchemaVersionApplied (part of every ensure run)', () => {
    const newStatementPos = source.indexOf(`addAttendanceColumnIfMissing('importBatchId'`)
    const markAppliedPos = source.indexOf('await markSchemaVersionApplied()')
    expect(newStatementPos).toBeGreaterThan(-1)
    expect(markAppliedPos).toBeGreaterThan(-1)
    expect(newStatementPos).toBeLessThan(markAppliedPos)
  })

  it('schema.prisma declares Attendance.importBatchId and the importBatch relation', () => {
    const model = schema.match(/model Attendance \{[\s\S]*?\n\}/)
    expect(model, 'Attendance model not found in schema.prisma').not.toBeNull()
    expect(model![0]).toMatch(/\bimportBatchId\b/)
    expect(model![0]).toContain('@@index([importBatchId])')
  })

  it('schema.prisma declares AttendanceImportBatch mapped to attendance_import_batches', () => {
    const model = schema.match(/model AttendanceImportBatch \{[\s\S]*?\n\}/)
    expect(model, 'AttendanceImportBatch model not found in schema.prisma').not.toBeNull()
    const body = model![0]
    expect(body).toContain('@@map("attendance_import_batches")')
    for (const field of ['id', 'uploadedById', 'fileName', 'totalRows', 'createdCount', 'skippedCount', 'skippedRows']) {
      expect(body, `expected field "${field}" on AttendanceImportBatch`).toMatch(new RegExp(`\\b${field}\\b`))
    }
  })
})
