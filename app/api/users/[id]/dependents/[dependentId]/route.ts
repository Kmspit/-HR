import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { requireAuth, requireEditOrgScope, isGuardResponse } from '@/lib/api-guard'
import { encryptField, FIELD_SALTS } from '@/lib/field-crypto'
import { validateDependentRow, dependentRowHasErrors } from '@/lib/employee-subrecords-validation'
import { DEPENDENT_RELATION_TYPES } from '@/lib/register-form-validation'
import type { DependentRelationType, Prisma } from '@prisma/client'

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

    const data: Prisma.DependentUpdateManyMutationInput = {
      name: form.name.trim(),
      relationType: form.relationType as DependentRelationType,
      birthDate,
      isTaxAllowance: form.isTaxAllowance,
      note: form.note.trim() || null,
    }
    if (form.nationalId !== undefined) {
      const digits = form.nationalId.replace(/\D/g, '')
      data.nationalIdEnc = digits ? encryptField(digits, FIELD_SALTS.DEPENDENT_NATIONAL_ID) : null
      data.nationalIdLast4 = digits ? digits.slice(-4) : null
    }

    // updateMany (ownership-scoped) so a dependentId belonging to a
    // different employee 404s instead of silently editing across employees.
    const result = await prisma.dependent.updateMany({ where: { id: dependentId, userId: id }, data })
    if (result.count === 0) return NextResponse.json({ error: 'ไม่พบข้อมูล' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(
  _: NextRequest,
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

    const result = await prisma.dependent.deleteMany({ where: { id: dependentId, userId: id } })
    if (result.count === 0) return NextResponse.json({ error: 'ไม่พบข้อมูล' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
