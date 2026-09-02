import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { requireAuth, requireEditOrgScope, isGuardResponse } from '@/lib/api-guard'
import { encryptField, FIELD_SALTS } from '@/lib/field-crypto'
import { validateDependentRow, dependentRowHasErrors } from '@/lib/employee-subrecords-validation'
import { DEPENDENT_RELATION_TYPES } from '@/lib/register-form-validation'
import { createAuditLog } from '@/lib/notifications'
import { summarizeDependentCreate } from '@/lib/subrecord-audit'
import type { DependentRelationType } from '@prisma/client'

function requestIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

function coerceForm(body: unknown) {
  const o = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const relationType = typeof o.relationType === 'string' ? o.relationType : ''
  return {
    name: typeof o.name === 'string' ? o.name : '',
    relationType: (DEPENDENT_RELATION_TYPES as readonly string[]).includes(relationType)
      ? (relationType as DependentRelationType)
      : ('' as const),
    birthDate: typeof o.birthDate === 'string' ? o.birthDate : '',
    nationalId: typeof o.nationalId === 'string' ? o.nationalId : '',
    isTaxAllowance: o.isTaxAllowance === true,
    note: typeof o.note === 'string' ? o.note : '',
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth()
    if (isGuardResponse(session)) return session

    const { id } = await params
    if (id !== session.user.id) {
      const scopeCheck = await requireEditOrgScope(id)
      if (isGuardResponse(scopeCheck)) return scopeCheck
    }

    const form = coerceForm(await req.json())
    const errors = validateDependentRow(form)
    if (dependentRowHasErrors(errors)) {
      return NextResponse.json({ error: Object.values(errors)[0] }, { status: 400 })
    }

    const rawNationalId = form.nationalId.replace(/\D/g, '')
    const birthDate = form.birthDate ? new Date(form.birthDate) : null
    if (form.birthDate && Number.isNaN(birthDate?.getTime())) {
      return NextResponse.json({ error: 'วันเกิดไม่ถูกต้อง' }, { status: 400 })
    }

    const dependent = await prisma.dependent.create({
      data: {
        userId: id,
        name: form.name.trim(),
        relationType: form.relationType as DependentRelationType,
        nationalIdEnc: rawNationalId ? encryptField(rawNationalId, FIELD_SALTS.DEPENDENT_NATIONAL_ID) : null,
        nationalIdLast4: rawNationalId ? rawNationalId.slice(-4) : null,
        birthDate,
        isTaxAllowance: form.isTaxAllowance,
        note: form.note.trim() || null,
      },
      select: {
        id: true, name: true, relationType: true, birthDate: true,
        nationalIdLast4: true, isTaxAllowance: true, note: true,
      },
    })

    const birthDateIso = dependent.birthDate ? dependent.birthDate.toISOString().slice(0, 10) : null

    await createAuditLog({
      actorId: session.user.id,
      targetId: id,
      targetType: 'User',
      action: 'UPDATE',
      after: summarizeDependentCreate({
        name: dependent.name,
        relationType: dependent.relationType,
        birthDate: birthDateIso,
        nationalIdLast4: dependent.nationalIdLast4,
        isTaxAllowance: dependent.isTaxAllowance,
        note: dependent.note,
      }),
      ip: requestIp(req),
      userAgent: req.headers.get('user-agent') ?? undefined,
    })

    return NextResponse.json({
      dependent: { ...dependent, birthDate: birthDateIso },
    }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
