import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { requireAuth, requireEditOrgScope, isGuardResponse } from '@/lib/api-guard'
import { encryptField, decryptField, FIELD_SALTS } from '@/lib/field-crypto'
import { validateDependentRow, dependentRowHasErrors } from '@/lib/employee-subrecords-validation'
import { DEPENDENT_RELATION_TYPES } from '@/lib/register-form-validation'
import { createAuditLog } from '@/lib/notifications'
import { summarizeDependentUpdate, summarizeDependentDelete, type DependentAuditRow } from '@/lib/subrecord-audit'
import type { DependentRelationType, Prisma } from '@prisma/client'

function requestIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

function coercePatch(body: unknown) {
  const o = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const relationType = typeof o.relationType === 'string' ? o.relationType : ''
  return {
    name: typeof o.name === 'string' ? o.name : '',
    relationType: (DEPENDENT_RELATION_TYPES as readonly string[]).includes(relationType)
      ? (relationType as DependentRelationType)
      : ('' as const),
    birthDate: typeof o.birthDate === 'string' ? o.birthDate : '',
    isTaxAllowance: o.isTaxAllowance === true,
    note: typeof o.note === 'string' ? o.note : '',
    // Present only when the HR admin explicitly typed a new value after
    // revealing the current one (see the .../sensitive route + the tab's
    // reveal-then-edit flow, same pattern as EmployeeEditClient's
    // NationalIdField) — absent means "untouched, leave as-is", present
    // (even blank) means a deliberate set-or-clear.
    nationalId: typeof o.nationalId === 'string' ? o.nationalId : undefined,
  }
}

function toDependentAuditRow(row: {
  name: string
  relationType: DependentRelationType
  birthDate: Date | null
  nationalIdLast4: string | null
  isTaxAllowance: boolean
  note: string | null
}): DependentAuditRow {
  return {
    name: row.name,
    relationType: row.relationType,
    birthDate: row.birthDate ? row.birthDate.toISOString().slice(0, 10) : null,
    nationalIdLast4: row.nationalIdLast4,
    isTaxAllowance: row.isTaxAllowance,
    note: row.note,
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; dependentId: string }> },
) {
  try {
    const session = await requireAuth()
    if (isGuardResponse(session)) return session

    const { id, dependentId } = await params
    if (id !== session.user.id) {
      const scopeCheck = await requireEditOrgScope(id)
      if (isGuardResponse(scopeCheck)) return scopeCheck
    }

    const form = coercePatch(await req.json())
    // nationalId is never part of row validation (see validateDependentRow's
    // own comment) — `?? ''` only satisfies the shared DependentForm type
    // here, it does not change what gets validated or written.
    const errors = validateDependentRow({ ...form, nationalId: form.nationalId ?? '' })
    if (dependentRowHasErrors(errors)) {
      return NextResponse.json({ error: Object.values(errors)[0] }, { status: 400 })
    }

    const birthDate = form.birthDate ? new Date(form.birthDate) : null
    if (form.birthDate && Number.isNaN(birthDate?.getTime())) {
      return NextResponse.json({ error: 'วันเกิดไม่ถูกต้อง' }, { status: 400 })
    }

    const nationalIdTouched = form.nationalId !== undefined

    // nationalIdEnc is always selected here (cheap column, not decrypted
    // unless nationalIdTouched) — only the DECRYPT below is conditional on
    // this edit actually changing it, see subrecord-audit.ts's header
    // comment for why that matters.
    const beforeRow = await prisma.dependent.findFirst({
      where: { id: dependentId, userId: id },
      select: {
        name: true, relationType: true, birthDate: true, nationalIdLast4: true,
        nationalIdEnc: true, isTaxAllowance: true, note: true,
      },
    })
    if (!beforeRow) return NextResponse.json({ error: 'ไม่พบข้อมูล' }, { status: 404 })

    const before: DependentAuditRow = {
      ...toDependentAuditRow(beforeRow),
      ...(nationalIdTouched
        ? { nationalIdPlain: beforeRow.nationalIdEnc ? decryptField(beforeRow.nationalIdEnc, FIELD_SALTS.DEPENDENT_NATIONAL_ID) : null }
        : {}),
    }

    const data: Prisma.DependentUpdateManyMutationInput = {
      name: form.name.trim(),
      relationType: form.relationType as DependentRelationType,
      birthDate,
      isTaxAllowance: form.isTaxAllowance,
      note: form.note.trim() || null,
    }
    let afterNationalIdPlain: string | null = null
    if (nationalIdTouched) {
      const digits = (form.nationalId as string).replace(/\D/g, '')
      data.nationalIdEnc = digits ? encryptField(digits, FIELD_SALTS.DEPENDENT_NATIONAL_ID) : null
      data.nationalIdLast4 = digits ? digits.slice(-4) : null
      afterNationalIdPlain = digits || null
    }

    // updateMany (ownership-scoped) so a dependentId belonging to a
    // different employee 404s instead of silently editing across employees.
    const result = await prisma.dependent.updateMany({ where: { id: dependentId, userId: id }, data })
    if (result.count === 0) return NextResponse.json({ error: 'ไม่พบข้อมูล' }, { status: 404 })

    const after: DependentAuditRow = {
      name: data.name as string,
      relationType: data.relationType as DependentRelationType,
      birthDate: form.birthDate || null,
      nationalIdLast4: nationalIdTouched ? (data.nationalIdLast4 as string | null) : before.nationalIdLast4,
      isTaxAllowance: form.isTaxAllowance,
      note: data.note as string | null,
      ...(nationalIdTouched ? { nationalIdPlain: afterNationalIdPlain } : {}),
    }

    const event = summarizeDependentUpdate(before, after)
    if (event) {
      await createAuditLog({
        actorId: session.user.id,
        targetId: id,
        targetType: 'User',
        action: 'UPDATE',
        after: event,
        ip: requestIp(req),
        userAgent: req.headers.get('user-agent') ?? undefined,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; dependentId: string }> },
) {
  try {
    const session = await requireAuth()
    if (isGuardResponse(session)) return session

    const { id, dependentId } = await params
    if (id !== session.user.id) {
      const scopeCheck = await requireEditOrgScope(id)
      if (isGuardResponse(scopeCheck)) return scopeCheck
    }

    const before = await prisma.dependent.findFirst({
      where: { id: dependentId, userId: id },
      select: { name: true, relationType: true, birthDate: true, nationalIdLast4: true, isTaxAllowance: true, note: true },
    })
    if (!before) return NextResponse.json({ error: 'ไม่พบข้อมูล' }, { status: 404 })

    const result = await prisma.dependent.deleteMany({ where: { id: dependentId, userId: id } })
    if (result.count === 0) return NextResponse.json({ error: 'ไม่พบข้อมูล' }, { status: 404 })

    await createAuditLog({
      actorId: session.user.id,
      targetId: id,
      targetType: 'User',
      action: 'UPDATE',
      after: summarizeDependentDelete(toDependentAuditRow(before)),
      ip: requestIp(req),
      userAgent: req.headers.get('user-agent') ?? undefined,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
