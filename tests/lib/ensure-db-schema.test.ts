import { readFileSync } from 'fs'
import { describe, it, expect } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '@/lib/ensure-db-schema'

const source = readFileSync('lib/ensure-db-schema.ts', 'utf8')
const schema = readFileSync('prisma/schema.prisma', 'utf8')

describe('Perf audit Phase A — TaskAssignment and Notification.userId indexes', () => {
  it('bumps CURRENT_SCHEMA_VERSION so the cron/schema-migrate run picks up the new indexes', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(900015)
  })

  it('ensure-db-schema.ts creates all 6 TaskAssignment indexes idempotently (IF NOT EXISTS)', () => {
    for (const col of ['assignee_id', 'assigned_by_id', 'case_id', 'client_company_id', 'status', 'due_date']) {
      const re = new RegExp(`CREATE INDEX IF NOT EXISTS \\S+\\s+ON task_assignments \\(${col}\\)`)
      expect(source, `expected a CREATE INDEX statement for task_assignments.${col}`).toMatch(re)
    }
  })

  it('ensure-db-schema.ts creates the notifications.userId index idempotently (IF NOT EXISTS)', () => {
    expect(source).toMatch(/CREATE INDEX IF NOT EXISTS \S+\s+ON notifications \(userId\)/)
  })

  it('schema.prisma declares matching @@index directives on TaskAssignment for every indexed field', () => {
    const modelMatch = schema.match(/model TaskAssignment \{[\s\S]*?\n\}/)
    expect(modelMatch, 'TaskAssignment model not found in schema.prisma').not.toBeNull()
    const modelBody = modelMatch![0]
    for (const field of ['assigneeId', 'assignedById', 'caseId', 'clientCompanyId', 'status', 'dueDate']) {
      expect(modelBody, `expected @@index([${field}]) on TaskAssignment`).toContain(`@@index([${field}])`)
    }
  })

  it('schema.prisma declares @@index([userId]) on Notification', () => {
    const modelMatch = schema.match(/model Notification \{[\s\S]*?\n\}/)
    expect(modelMatch, 'Notification model not found in schema.prisma').not.toBeNull()
    expect(modelMatch![0]).toContain('@@index([userId])')
  })

  it('the new index statements run before markSchemaVersionApplied (so they are part of every ensure run, not skipped)', () => {
    const newIndexPos = source.indexOf('idx_task_assignments_assignee_id')
    const markAppliedPos = source.indexOf('await markSchemaVersionApplied()')
    expect(newIndexPos).toBeGreaterThan(-1)
    expect(markAppliedPos).toBeGreaterThan(-1)
    expect(newIndexPos).toBeLessThan(markAppliedPos)
  })
})
