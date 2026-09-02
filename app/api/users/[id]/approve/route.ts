import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification, sendLineNotify, createAuditLog } from '@/lib/notifications'
import { apiError } from '@/lib/api-handler'
import { canApproveAccounts } from '@/lib/access-control'
import { HR_ADMIN } from '@/lib/module-gates'
import { buildBranchScope, branchUserWhere } from '@/lib/branch-scope'
import { validateOrgAssignment } from '@/lib/user-org'
import { EMPLOYMENT_TYPES } from '@/lib/approve-assignment-validation'
import { mapEmploymentTypeToLegacy } from '@/lib/employment-assignment'
import { EMPLOYEE_AUDIT_SELECT, snapshotEmployeeForAudit, logEmployeeUpdateIfChanged } from '@/lib/employee-audit'
import type { EmploymentType } from '@prisma/client'
import { headers } from 'next/headers'

type ApproveBody = {
  action: 'APPROVE' | 'REJECT'
  reason?: string
  // APPROVE-only fields (Phase 1 step 7 — unified approve+org-assign):
  jobPositionId?: string
  newPositionName?: string
  divisionId?: string
  departmentId?: string
  sectionId?: string
  employmentType?: string
  startDate?: string
  baseSalary?: number | string
}

function isEmploymentType(v: unknown): v is EmploymentType {
  return typeof v === 'string' && (EMPLOYMENT_TYPES as readonly string[]).includes(v)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || !canApproveAccounts(session.user.role)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์อนุมัติบัญชี' }, { status: 403 })
    }

    const { id } = await params
    const body   = await req.json() as ApproveBody
    const ip     = (await headers()).get('x-forwarded-for') ?? 'unknown'

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (user.status !== 'PENDING') return NextResponse.json({ error: 'User is not pending' }, { status: 400 })

    const scope = buildBranchScope(session.user, {})
    const inScope = await prisma.user.findFirst({
      where: branchUserWhere(scope, { id }),
      select: { id: true },
    })
    if (!inScope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (body.action === 'REJECT') {
      // Compare-and-swap on status: a plain update() here let two approvers acting
      // near-simultaneously (one APPROVE, one REJECT) both pass the stale
      // `user.status !== 'PENDING'` check above and both write — whichever commits
      // last wins the actual status, but both audit logs + notifications still
      // fire, leaving a contradictory trail. Only the request that actually flips
      // status away from PENDING should proceed past this point.
      const result = await prisma.user.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'REJECTED', approvedById: session.user.id, approvedAt: new Date() },
      })
      if (result.count === 0) {
        return NextResponse.json({ error: 'บัญชีนี้ถูกดำเนินการไปแล้ว' }, { status: 409 })
      }

      // Audit log is a compliance record and must be guaranteed to have actually
      // been written before responding — a serverless function invocation can
      // be frozen/torn down right after the response is sent, so an un-awaited
      // write here would not be guaranteed to complete. createAuditLog already
      // catches and logs its own errors internally, so awaiting it can't make
      // this request fail — it only guarantees the write is attempted and
      // finished first.
      await createAuditLog({
        actorId:    session.user.id,
        targetId:   id,
        targetType: 'User',
        action:     'REJECT',
        before:     { status: 'PENDING' },
        after:      { status: 'REJECTED' },
        ip,
      })

      void createNotification({
        userId:  id,
        type:    'ACCOUNT_REJECTED',
        title:   '❌ คำขอถูกปฏิเสธ',
        message: `คำขอสมัครของคุณถูกปฏิเสธ${body.reason ? `: ${body.reason}` : ''} กรุณาติดต่อ HR`,
      })

      void sendLineNotify(
        `\n🔔 [เค เอ็ม เซอร์วิส พลัส] สถานะบัญชี: ถูกปฏิเสธ ❌\nชื่อ: ${user.name}\nอีเมล: ${user.email}\nโดย: ${session.user.name}${body.reason ? `\nเหตุผล: ${body.reason}` : ''}`
      )

      return NextResponse.json({ success: true, status: 'REJECTED' })
    }

    if (body.action !== 'APPROVE') {
      return NextResponse.json({ error: 'action ไม่ถูกต้อง' }, { status: 400 })
    }

    // ── APPROVE — unified with org-assignment (Phase 1 step 7) ─────────────────
    // Server-side re-validation mirrors lib/approve-assignment-validation.ts's
    // client-side checks — a public-shaped payload from the client is never
    // trusted for something this consequential (creates the employee's whole
    // employment record).
    const divisionId   = typeof body.divisionId === 'string' ? body.divisionId : ''
    const departmentId = typeof body.departmentId === 'string' ? body.departmentId : ''
    const sectionId    = typeof body.sectionId === 'string' && body.sectionId.trim() ? body.sectionId.trim() : null
    const jobPositionId   = typeof body.jobPositionId === 'string' ? body.jobPositionId.trim() : ''
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
    const startDate = body.startDate ? new Date(body.startDate) : null
    if (!startDate || Number.isNaN(startDate.getTime())) {
      return NextResponse.json({ error: 'วันที่เริ่มงานไม่ถูกต้อง' }, { status: 400 })
    }

    // baseSalary is HR_ADMIN-only (same gate as the standalone edit-page field,
    // Phase 1 step 0) — an approver outside that group can still approve and
    // create the assignment, just without a salary value; HR_ADMIN fills it in
    // later via the employee edit page. Silently ignored rather than a hard
    // error, matching step 0's "don't break an older/smaller client" reasoning.
    const canEditSalary = HR_ADMIN.includes(session.user.role)
    let baseSalary: number | null = null
    if (canEditSalary) {
      if (body.baseSalary == null || body.baseSalary === '') {
        return NextResponse.json({ error: 'กรุณากรอกเงินเดือน' }, { status: 400 })
      }
      const n = Number(body.baseSalary)
      if (Number.isNaN(n) || n < 0) {
        return NextResponse.json({ error: 'เงินเดือนไม่ถูกต้อง' }, { status: 400 })
      }
      baseSalary = n
    }

    const valid = await validateOrgAssignment(user.branchId, divisionId, departmentId, sectionId)
    if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 })

    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      include: { division: true },
    })
    if (!department) return NextResponse.json({ error: 'ไม่พบแผนก' }, { status: 400 })
    const section = sectionId ? await prisma.section.findUnique({ where: { id: sectionId } }) : null

    // Resolve or create the JobPosition — upsert-by-name matches the same
    // idempotent pattern ensure-db-schema.ts uses to seed this table.
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

    const approved = await prisma.$transaction(async (tx) => {
      // Same compare-and-swap reasoning as REJECT above — this is also what
      // guarantees only one concurrent request ever reaches the
      // employmentAssignment.create() below, so no separate "does an
      // assignment already exist" pre-check is needed.
      const result = await tx.user.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'ACTIVE',
          approvedById: session.user.id,
          approvedAt: new Date(),
          position: jobPosition.name,
          department: department.name,
          divisionId,
          departmentId,
          sectionId,
          employeeType: legacyEmployeeType,
          startDate,
          ...(canEditSalary ? { baseSalary } : {}),
        },
      })
      if (result.count === 0) return false

      await tx.employmentAssignment.create({
        data: {
          userId: id,
          effectiveFrom: startDate,
          changeType: 'HIRE',
          employmentType,
          divisionId,
          departmentId,
          sectionId,
          jobPositionId: jobPosition.id,
          branchId: user.branchId,
          baseSalary,
          createdById: session.user.id,
        },
      })

      return true
    })

    if (!approved) {
      return NextResponse.json({ error: 'บัญชีนี้ถูกดำเนินการไปแล้ว' }, { status: 409 })
    }

    const afterAudit = await prisma.user.findUnique({ where: { id }, select: EMPLOYEE_AUDIT_SELECT })
    if (afterAudit) {
      await logEmployeeUpdateIfChanged({
        actorId: session.user.id,
        targetId: id,
        before: snapshotEmployeeForAudit(user),
        after: snapshotEmployeeForAudit(afterAudit),
        ip,
        userAgent: req.headers.get('user-agent') ?? undefined,
      })
    }

    void createNotification({
      userId:  id,
      type:    'ACCOUNT_APPROVED',
      title:   '✅ บัญชีได้รับการอนุมัติ',
      message: `บัญชีของคุณได้รับการอนุมัติแล้ว — ตำแหน่ง ${jobPosition.name}, ${department.division.name} / ${department.name}${section ? ` / ${section.name}` : ''}`,
    })

    void sendLineNotify(
      `\n🔔 [เค เอ็ม เซอร์วิส พลัส] สถานะบัญชี: อนุมัติแล้ว ✅\nชื่อ: ${user.name}\nอีเมล: ${user.email}\nตำแหน่ง: ${jobPosition.name}\nฝ่าย/แผนก: ${department.division.name} / ${department.name}\nโดย: ${session.user.name}`
    )

    return NextResponse.json({ success: true, status: 'ACTIVE' })
  } catch (err) {
    return apiError(err)
  }
}
