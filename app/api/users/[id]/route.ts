import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { assertLineFieldsUnique, parseLineFields } from '@/lib/line-profile'
import {
  normalizeEmail,
  normalizeNationalId,
  parseBirthDate,
  isBlankProtectedField,
  SELF_PROFILE_FORBIDDEN,
} from '@/lib/profile-update'
import { normalizeThaiPhone } from '@/lib/profile-name'
import { canAssignRole, canChangeUserStatus } from '@/lib/role-assignment'
import { requireAuth, requireOrgScope, requireEditOrgScope, isGuardResponse } from '@/lib/api-guard'
import { SAFE_USER_SELECT, MANAGER_USER_SELECT } from '@/lib/safe-user-select'
import { bumpSessionEpoch } from '@/lib/session-epoch'
import { HR_ADMIN } from '@/lib/module-gates'
import { EMPLOYEE_AUDIT_SELECT, snapshotEmployeeForAudit, logEmployeeUpdateIfChanged } from '@/lib/employee-audit'
import { createAuditLog } from '@/lib/notifications'
import type { Role, UserStatus } from '@prisma/client'

function requestIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth()
    if (isGuardResponse(session)) return session

    const { id } = await params
    if (id !== session.user.id) {
      const scopeCheck = await requireOrgScope(id)
      if (isGuardResponse(scopeCheck)) return scopeCheck
    }

    const isSelf = id === session.user.id

    const select =
      session.user.role === 'MANAGER' && !isSelf
        ? MANAGER_USER_SELECT
        : SAFE_USER_SELECT

    const user = await prisma.user.findUnique({
      where: { id },
      select,
    })

    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ user })
  } catch (err) {
    return apiError(err)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth()
    if (isGuardResponse(session)) return session

    const { id } = await params
    if (id !== session.user.id) {
      const scopeCheck = await requireEditOrgScope(id)
      if (isGuardResponse(scopeCheck)) return scopeCheck
    }

    const beforeAudit = await prisma.user.findUnique({ where: { id }, select: EMPLOYEE_AUDIT_SELECT })

    const body = await req.json()

    if (id === session.user.id) {
      for (const key of ['role', 'status']) {
        if (key in body && body[key] !== undefined) {
          return NextResponse.json(
            { error: 'ไม่สามารถแก้ Role หรือสถานะของตัวเองได้ — ให้ Admin คนอื่นช่วยแก้' },
            { status: 403 },
          )
        }
      }
      if ('baseSalary' in body && body.baseSalary !== undefined) {
        return NextResponse.json(
          { error: 'ไม่สามารถแก้เงินเดือนของตัวเองได้' },
          { status: 403 },
        )
      }
    }

    if (id === session.user.id) {
      for (const key of Object.keys(body)) {
        if (SELF_PROFILE_FORBIDDEN.has(key) && !['role', 'status'].includes(key)) {
          if (['password', 'passwordHash'].includes(key)) {
            return NextResponse.json({ error: 'ไม่รองรับการเปลี่ยนรหัสผ่านทาง API นี้' }, { status: 400 })
          }
          return NextResponse.json(
            { error: 'ไม่สามารถแก้ไขข้อมูลนี้ได้ — ติดต่อ HR' },
            { status: 403 },
          )
        }
      }
    }

    if ('lineUserId' in body || 'lineDisplayName' in body) {
      return NextResponse.json(
        { error: 'การเชื่อม LINE OA ต้องทำผ่านเมนูผูก LINE ในโปรไฟล์' },
        { status: 403 },
      )
    }

    const data: Record<string, unknown> = {}

    if (body.email != null) {
      const email = normalizeEmail(String(body.email))
      if (!email) return NextResponse.json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' }, { status: 400 })
      const dup = await prisma.user.findFirst({ where: { email, NOT: { id } } })
      if (dup) return NextResponse.json({ error: 'อีเมลนี้มีในระบบแล้ว' }, { status: 409 })
      data.email = email
    }

    if (body.phone != null) {
      const phone = normalizeThaiPhone(String(body.phone))
      if (!phone) {
        return NextResponse.json(
          { error: 'เบอร์โทรต้องเป็นตัวเลข 10 หลัก ขึ้นต้นด้วย 0' },
          { status: 400 },
        )
      }
      const dup = await prisma.user.findFirst({ where: { phone, NOT: { id } } })
      if (dup) return NextResponse.json({ error: 'เบอร์โทรนี้มีในระบบแล้ว' }, { status: 409 })
      data.phone = phone
    }

    if (body.nationalId !== undefined && !isBlankProtectedField('nationalId', body.nationalId)) {
      const nationalId = normalizeNationalId(body.nationalId)
      if (!nationalId) {
        return NextResponse.json({ error: 'เลขบัตรประชาชนต้อง 13 หลัก' }, { status: 400 })
      }
      const dup = await prisma.user.findFirst({ where: { nationalId, NOT: { id } } })
      if (dup) {
        return NextResponse.json({ error: 'เลขบัตรประชาชนนี้มีในระบบแล้ว' }, { status: 409 })
      }
      data.nationalId = nationalId
    }
    // blank nationalId is silently skipped, not written — clearing it is a deliberate,
    // separate action (see PROTECTED_CLEAR_FIELDS), not a side effect of saving the form

    if (body.birthDate !== undefined) {
      const birth = parseBirthDate(body.birthDate)
      if (birth === 'invalid') {
        return NextResponse.json({ error: 'วันเกิดไม่ถูกต้อง' }, { status: 400 })
      }
      data.birthDate = birth
    }

    if ('role' in body && body.role !== undefined) {
      const nextRole = body.role as Role
      if (!canAssignRole(session.user.role as Role, nextRole)) {
        return NextResponse.json({ error: 'ไม่มีสิทธิ์กำหนด Role นี้' }, { status: 403 })
      }
      data.role = nextRole
    }

    if ('status' in body && body.status !== undefined) {
      if (!canChangeUserStatus(session.user.role as Role)) {
        return NextResponse.json({ error: 'ไม่มีสิทธิ์เปลี่ยนสถานะบัญชี' }, { status: 403 })
      }
      const nextStatus = body.status as UserStatus
      if (nextStatus === 'ACTIVE') {
        return NextResponse.json(
          { error: 'การอนุมัติบัญชีต้องทำผ่าน /api/users/[id]/approve' },
          { status: 403 },
        )
      }
      data.status = nextStatus
    }

    // baseSalary is deliberately not in allowedFields — it's HR_ADMIN-only
    // (SUPER_ADMIN/CEO/MANAGER_HR/HR/ADMIN), narrower than the general
    // canManageUserProfile gate that lets this endpoint through in the first
    // place (which still includes MANAGER). A MANAGER editing a direct
    // report's other fields is normal; touching pay is not. Ignored rather
    // than a hard error — this must not break an older client that still
    // sends the field alongside other edits it's allowed to make — but the
    // attempt itself is audit-logged below.
    let baseSalaryAttemptedBy: string | null = null
    if ('baseSalary' in body && body.baseSalary !== undefined) {
      if (HR_ADMIN.includes(session.user.role as Role)) {
        data.baseSalary = body.baseSalary
      } else {
        baseSalaryAttemptedBy = session.user.role
      }
    }

    const allowedFields = [
      'name',
      'nameEn',
      'nickname',
      'prefix',
      'address',
      'addressIdCard',
      'department',
      'position',
      'employeeType',
      'managerId',
      'teamLeaderId',
      'socialSecurity',
      'isCoworker',
    ] as const

    for (const key of allowedFields) {
      if (key in body) data[key] = body[key]
    }

    // startDate is protected — see PROTECTED_CLEAR_FIELDS. Handled separately from the
    // generic loop above so a blank value is skipped instead of nulling out tenure.
    if ('startDate' in body && !isBlankProtectedField('startDate', body.startDate)) {
      data.startDate = body.startDate
    }

    if ('lineId' in body) {
      if (id === session.user.id) {
        return NextResponse.json(
          { error: 'แก้ LINE ID ได้ที่หน้าโปรไฟล์เท่านั้น' },
          { status: 403 },
        )
      }
      if (!HR_ADMIN.includes(session.user.role as Role)) {
        return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ LINE ID' }, { status: 403 })
      }
      const lineParsed = parseLineFields(
        { lineId: body.lineId },
        { requireLineId: false, allowUserId: false, allowDisplayName: false },
      )
      if (!lineParsed.ok) {
        return NextResponse.json({ error: lineParsed.error }, { status: 400 })
      }
      const lineUnique = await assertLineFieldsUnique(lineParsed, id)
      if (!lineUnique.ok) {
        return NextResponse.json({ error: lineUnique.error }, { status: 409 })
      }
      data.lineId = lineParsed.lineId
    }

    if (id === session.user.id) {
      delete data.role
      delete data.status
      delete data.baseSalary
    }

    if (data.startDate) data.startDate = new Date(data.startDate as string)

    const shouldRevokeSession =
      ('role' in body && body.role !== undefined) ||
      ('status' in body && body.status !== undefined)

    const user = await prisma.user.update({ where: { id }, data, select: SAFE_USER_SELECT })
    if (shouldRevokeSession) await bumpSessionEpoch(id)

    if (beforeAudit) {
      const afterAudit = await prisma.user.findUnique({ where: { id }, select: EMPLOYEE_AUDIT_SELECT })
      if (afterAudit) {
        await logEmployeeUpdateIfChanged({
          actorId: session.user.id,
          targetId: id,
          before: snapshotEmployeeForAudit(beforeAudit),
          after: snapshotEmployeeForAudit(afterAudit),
          ip: requestIp(req),
          userAgent: req.headers.get('user-agent') ?? undefined,
        })
      }
    }

    if (baseSalaryAttemptedBy) {
      await createAuditLog({
        actorId: session.user.id,
        targetId: id,
        targetType: 'User',
        action: 'UPDATE',
        after: {
          baseSalaryChangeBlocked: true,
          attemptedRole: baseSalaryAttemptedBy,
          attemptedValue: body.baseSalary,
        },
        ip: requestIp(req),
        userAgent: req.headers.get('user-agent') ?? undefined,
      })
    }

    return NextResponse.json({ user })
  } catch (err) {
    return apiError(err)
  }
}
