import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { requireEditOrgScope, isGuardResponse } from '@/lib/api-guard'
import {
  mapEmployeeAuditLogs,
  collectReferencedIds,
  EMPLOYEE_AUDIT_TRACKING_START,
  type EmployeeAuditSnapshot,
  type EmployeeNameLookup,
} from '@/lib/employee-audit'

function isSubrecordEvent(v: unknown): boolean {
  return typeof v === 'object' && v !== null && (v as { subrecordEvent?: unknown }).subrecordEvent === true
}

// Same role gate as PATCH /api/users/[id] and PATCH /api/users/[id]/org —
// whoever can edit this employee's record can see who changed what in it.
const HISTORY_TAKE = 50

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const scopeCheck = await requireEditOrgScope(id)
    if (isGuardResponse(scopeCheck)) return scopeCheck

    const logs = await prisma.auditLog.findMany({
      where: { targetId: id, targetType: 'User', action: 'UPDATE' },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_TAKE,
      select: {
        id: true,
        before: true,
        after: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
    })

    const snapshots: EmployeeAuditSnapshot[] = []
    for (const log of logs) {
      try {
        const before: unknown = log.before ? JSON.parse(log.before) : null
        const after: unknown = log.after ? JSON.parse(log.after) : null
        // Subrecord events (EmergencyContact/Dependent/BankAccount CRUD) are
        // not EmployeeAuditSnapshot-shaped — collectReferencedIds() below
        // only looks for User-row id fields (managerId etc.), which these
        // don't have, so they're skipped here entirely rather than pushed in.
        if (before && !isSubrecordEvent(before)) snapshots.push(before as EmployeeAuditSnapshot)
        if (after && !isSubrecordEvent(after)) snapshots.push(after as EmployeeAuditSnapshot)
      } catch {
        // Skip unparsable/legacy rows — mapEmployeeAuditLogs() re-parses and
        // drops these the same way when building the display list.
      }
    }

    const { userIds, divisionIds, sectionIds } = collectReferencedIds(snapshots)
    const [users, divisions, sections] = await Promise.all([
      userIds.length
        ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      divisionIds.length
        ? prisma.division.findMany({ where: { id: { in: divisionIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      sectionIds.length
        ? prisma.section.findMany({ where: { id: { in: sectionIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ])

    const lookup: EmployeeNameLookup = {
      users: new Map(users.map((u) => [u.id, u.name])),
      divisions: new Map(divisions.map((d) => [d.id, d.name])),
      sections: new Map(sections.map((s) => [s.id, s.name])),
    }

    const history = mapEmployeeAuditLogs(logs, lookup)

    return NextResponse.json({ history, trackingStartedAt: EMPLOYEE_AUDIT_TRACKING_START })
  } catch (err) {
    return apiError(err)
  }
}
