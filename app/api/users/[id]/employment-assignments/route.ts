import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { requireAuth, requireOrgScope, isGuardResponse } from '@/lib/api-guard'
import { HR_ADMIN } from '@/lib/module-gates'
import { canManageOrg } from '@/lib/org-permissions'
import { validateOrgAssignment } from '@/lib/user-org'
import { getCurrentAssignment, mapEmploymentTypeToLegacy } from '@/lib/employment-assignment'
import { EMPLOYMENT_TYPES } from '@/lib/approve-assignment-validation'
import { ASSIGNMENT_CHANGE_TYPES, TERMINATION_TYPES } from '@/lib/employment-assignment-validation'
import { EMPLOYEE_AUDIT_SELECT, snapshotEmployeeForAudit, logEmployeeUpdateIfChanged } from '@/lib/employee-audit'
import type { EmploymentChangeType, EmploymentType, TerminationType, Role } from '@prisma/client'

function requestIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

function isAssignmentChangeType(v: unknown): v is EmploymentChangeType {
  return typeof v === 'string' && (ASSIGNMENT_CHANGE_TYPES as readonly string[]).includes(v)
}
function isEmploymentType(v: unknown): v is EmploymentType {
  return typeof v === 'string' && (EMPLOYMENT_TYPES as readonly string[]).includes(v)
}
function isTerminationType(v: unknown): v is TerminationType {
  return typeof v === 'string' && (TERMINATION_TYPES as readonly string[]).includes(v)
}

/**
 * "ประวัติตำแหน่ง" tab (Phase 1 step 8c) — full EmploymentAssignment history
 * for one employee, and creating a new row (PROMOTION/TRANSFER/
 * CONTRACT_RENEW/TERMINATION — HIRE only ever happens via the approve
 * flow, step 7).
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth()
    if (isGuardResponse(session)) return session

    const { id } = await params
    if (id !== session.user.id) {
      const scopeCheck = await requireOrgScope(id)
      if (isGuardResponse(scopeCheck)) return scopeCheck
    }

    const canViewSalary = HR_ADMIN.includes(session.user.role as Role)

    const [assignments, current] = await Promise.all([
      prisma.employmentAssignment.findMany({
        where: { userId: id },
        orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
        include: {
          jobPosition: { select: { name: true } },
        },
      }),
      getCurrentAssignment(id),
    ])

    // divisionId/departmentId/sectionId/createdById have no Prisma relation
    // (same no-raw-FK convention as the rest of this post-file-split table
    // — see the schema's own comment on EmploymentAssignment) — resolve
    // names via batched lookups instead of `include`.
    const divisionIds = [...new Set(assignments.map((a) => a.divisionId).filter((v): v is string => Boolean(v)))]
    const departmentIds = [...new Set(assignments.map((a) => a.departmentId).filter((v): v is string => Boolean(v)))]
    const sectionIds = [...new Set(assignments.map((a) => a.sectionId).filter((v): v is string => Boolean(v)))]
    const creatorIds = [...new Set(assignments.map((a) => a.createdById))]

    const [divisions, departments, sections, creators] = await Promise.all([
      divisionIds.length ? prisma.division.findMany({ where: { id: { in: divisionIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
      departmentIds.length ? prisma.department.findMany({ where: { id: { in: departmentIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
      sectionIds.length ? prisma.section.findMany({ where: { id: { in: sectionIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
      creatorIds.length ? prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    ])
    const divisionNames = new Map(divisions.map((d) => [d.id, d.name]))
    const departmentNames = new Map(departments.map((d) => [d.id, d.name]))
    const sectionNames = new Map(sections.map((s) => [s.id, s.name]))
    const creatorNames = new Map(creators.map((c) => [c.id, c.name]))

    return NextResponse.json({
      currentAssignmentId: current?.id ?? null,
      assignments: assignments.map((a) => ({
        id: a.id,
        effectiveFrom: a.effectiveFrom.toISOString().slice(0, 10),
        changeType: a.changeType,
        // ids alongside the resolved names — the "สร้างประวัติใหม่" form
        // prefills its pickers from the current assignment's raw ids
        // (matched against currentAssignmentId), not by re-parsing display text.
        jobPositionId: a.jobPositionId,
        positionName: a.jobPosition.name,
        divisionId: a.divisionId,
        divisionName: a.divisionId ? (divisionNames.get(a.divisionId) ?? null) : null,
        departmentId: a.departmentId,
        departmentName: a.departmentId ? (departmentNames.get(a.departmentId) ?? null) : null,
        sectionId: a.sectionId,
        sectionName: a.sectionId ? (sectionNames.get(a.sectionId) ?? null) : null,
        employmentType: a.employmentType,
        baseSalary: canViewSalary ? a.baseSalary : undefined,
        terminationType: a.terminationType,
        terminationReason: a.terminationReason,
        rehireEligible: a.rehireEligible,
        reason: a.reason,
        note: a.note,
        createdByName: creatorNames.get(a.createdById) ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth()
    if (isGuardResponse(session)) return session
    if (!canManageOrg(session.user.role as Role)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์สร้างประวัติตำแหน่ง' }, { status: 403 })
    }

    const { id } = await params
    const body = await req.json() as Record<string, unknown>

    if (!isAssignmentChangeType(body.changeType)) {
      return NextResponse.json({ error: 'กรุณาเลือกประเภทการเปลี่ยนแปลง' }, { status: 400 })
    }
    const changeType = body.changeType

    const effectiveFrom = typeof body.effectiveFrom === 'string' ? new Date(body.effectiveFrom) : null
    if (!effectiveFrom || Number.isNaN(effectiveFrom.getTime())) {
      return NextResponse.json({ error: 'วันที่มีผลไม่ถูกต้อง' }, { status: 400 })
    }
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)
    if (effectiveFrom.getTime() > todayEnd.getTime()) {
      // effectiveFrom in the future would need a deferred sync job (apply
      // to User fields only once the date arrives) that doesn't exist yet —
      // see this route's own design notes. Blocked outright rather than
      // half-built, per the user's own "block it and say why" fallback.
      return NextResponse.json({ error: 'ยังไม่รองรับวันที่มีผลในอนาคต — ระบบต้องมี job สำหรับ sync ค่าล่วงหน้าก่อน ตอนนี้ระบุได้แค่วันนี้หรือย้อนหลัง' }, { status: 400 })
    }

    const beforeAudit = await prisma.user.findUnique({
      where: { id },
      select: { ...EMPLOYEE_AUDIT_SELECT, branchId: true },
    })
    if (!beforeAudit) return NextResponse.json({ error: 'ไม่พบพนักงาน' }, { status: 404 })

    const latest = await prisma.employmentAssignment.findFirst({
      where: { userId: id },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    })
    if (latest && effectiveFrom.getTime() <= latest.effectiveFrom.getTime()) {
      return NextResponse.json({ error: 'วันที่มีผลต้องอยู่หลังประวัติล่าสุด (กันลำดับเวลาสับสน)' }, { status: 400 })
    }
    // TERMINATION carries forward the current assignment's position/org/
    // salary (see below) — there must be one to carry forward from.
    if (changeType === 'TERMINATION' && !latest) {
      return NextResponse.json({ error: 'พนักงานยังไม่มีประวัติตำแหน่ง — ไม่สามารถบันทึกการพ้นสภาพได้' }, { status: 400 })
    }

    const reason = typeof body.reason === 'string' ? body.reason.trim() || null : null
    const note = typeof body.note === 'string' ? body.note.trim() || null : null

    if (changeType === 'TERMINATION') {
      const terminationType = body.terminationType
      if (!isTerminationType(terminationType)) {
        return NextResponse.json({ error: 'กรุณาเลือกสาเหตุการพ้นสภาพ' }, { status: 400 })
      }
      const rehireEligible = body.rehireEligible
      if (typeof rehireEligible !== 'boolean') {
        return NextResponse.json({ error: 'กรุณาระบุสิทธิ์การกลับเข้าทำงาน' }, { status: 400 })
      }
      // latest is guaranteed non-null here (checked above) — its position/
      // org/employmentType/salary carry forward unchanged, since a
      // termination doesn't retroactively change what the person's last
      // real position was.
      const created = await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id }, data: { status: 'DISABLED' } })
        return tx.employmentAssignment.create({
          data: {
            userId: id,
            effectiveFrom,
            changeType: 'TERMINATION',
            employmentType: latest!.employmentType,
            divisionId: latest!.divisionId,
            departmentId: latest!.departmentId,
            sectionId: latest!.sectionId,
            jobPositionId: latest!.jobPositionId,
            branchId: beforeAudit.branchId,
            baseSalary: latest!.baseSalary,
            terminationType,
            terminationReason: typeof body.terminationReason === 'string' ? body.terminationReason.trim() || null : null,
            rehireEligible,
            reason,
            note,
            createdById: session.user.id,
          },
        })
      })

      const afterAudit = await prisma.user.findUnique({ where: { id }, select: EMPLOYEE_AUDIT_SELECT })
      if (afterAudit) {
        await logEmployeeUpdateIfChanged({
          actorId: session.user.id, targetId: id,
          before: snapshotEmployeeForAudit(beforeAudit), after: snapshotEmployeeForAudit(afterAudit),
          ip: requestIp(req), userAgent: req.headers.get('user-agent') ?? undefined,
        })
      }

      return NextResponse.json({ assignment: { id: created.id } }, { status: 201 })
    }

    // ── PROMOTION / TRANSFER / CONTRACT_RENEW ──────────────────────────────
    const divisionId = typeof body.divisionId === 'string' ? body.divisionId : ''
    const departmentId = typeof body.departmentId === 'string' ? body.departmentId : ''
    const sectionId = typeof body.sectionId === 'string' && body.sectionId.trim() ? body.sectionId.trim() : null
    const jobPositionId = typeof body.jobPositionId === 'string' ? body.jobPositionId.trim() : ''
    const newPositionName = typeof body.newPositionName === 'string' ? body.newPositionName.trim() : ''

    if (!divisionId || !departmentId) {
      return NextResponse.json({ error: 'กรุณาเลือกฝ่ายและแผนก' }, { status: 400 })
    }
    if (!jobPositionId && !newPositionName) {
      return NextResponse.json({ error: 'กรุณาเลือกหรือเพิ่มตำแหน่ง' }, { status: 400 })
    }
    if (!isEmploymentType(body.employmentType)) {
      return NextResponse.json({ error: 'กรุณาเลือกประเภทพนักงาน' }, { status: 400 })
    }
    const employmentType = body.employmentType

    // The whole action is HR_ADMIN-gated (canManageOrg above) — unlike step
    // 7's approve flow, there's no broader role that can create a
    // PROMOTION/TRANSFER without also being allowed to set salary, so
    // baseSalary is simply required here, not conditionally hidden.
    if (body.baseSalary == null || body.baseSalary === '') {
      return NextResponse.json({ error: 'กรุณากรอกเงินเดือน' }, { status: 400 })
    }
    const baseSalary = Number(body.baseSalary)
    if (Number.isNaN(baseSalary) || baseSalary < 0) {
      return NextResponse.json({ error: 'เงินเดือนไม่ถูกต้อง' }, { status: 400 })
    }

    const valid = await validateOrgAssignment(beforeAudit.branchId, divisionId, departmentId, sectionId)
    if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 })

    const department = await prisma.department.findUnique({ where: { id: departmentId } })
    if (!department) return NextResponse.json({ error: 'ไม่พบแผนก' }, { status: 400 })

    const jobPosition = jobPositionId
      ? await prisma.jobPosition.findUnique({ where: { id: jobPositionId } })
      : await prisma.jobPosition.upsert({
          where: { name: newPositionName },
          update: {},
          create: { name: newPositionName, isActive: true, sortOrder: 0 },
        })
    if (!jobPosition || !jobPosition.isActive) {
      return NextResponse.json({ error: 'ตำแหน่งไม่ถูกต้องหรือปิดใช้งาน' }, { status: 400 })
    }

    const legacyEmployeeType = mapEmploymentTypeToLegacy(employmentType)

    const created = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          position: jobPosition.name,
          department: department.name,
          divisionId,
          departmentId,
          sectionId,
          employeeType: legacyEmployeeType,
          baseSalary,
        },
      })
      return tx.employmentAssignment.create({
        data: {
          userId: id,
          effectiveFrom,
          changeType,
          employmentType,
          divisionId,
          departmentId,
          sectionId,
          jobPositionId: jobPosition.id,
          branchId: beforeAudit.branchId,
          baseSalary,
          reason,
          note,
          createdById: session.user.id,
        },
      })
    })

    const afterAudit = await prisma.user.findUnique({ where: { id }, select: EMPLOYEE_AUDIT_SELECT })
    if (afterAudit) {
      await logEmployeeUpdateIfChanged({
        actorId: session.user.id, targetId: id,
        before: snapshotEmployeeForAudit(beforeAudit), after: snapshotEmployeeForAudit(afterAudit),
        ip: requestIp(req), userAgent: req.headers.get('user-agent') ?? undefined,
      })
    }

    return NextResponse.json({ assignment: { id: created.id } }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
