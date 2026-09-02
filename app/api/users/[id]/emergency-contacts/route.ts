import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { requireAuth, requireEditOrgScope, isGuardResponse } from '@/lib/api-guard'
import { validateEmergencyContactRow, emergencyContactRowHasErrors } from '@/lib/employee-subrecords-validation'

function coerceForm(body: unknown) {
  const o = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  return {
    name: typeof o.name === 'string' ? o.name : '',
    relationship: typeof o.relationship === 'string' ? o.relationship : '',
    phone: typeof o.phone === 'string' ? o.phone : '',
    altPhone: typeof o.altPhone === 'string' ? o.altPhone : '',
    address: typeof o.address === 'string' ? o.address : '',
    isPrimary: o.isPrimary === true,
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
    const errors = validateEmergencyContactRow(form)
    if (emergencyContactRowHasErrors(errors)) {
      return NextResponse.json({ error: Object.values(errors)[0] }, { status: 400 })
    }

    const contact = await prisma.$transaction(async (tx) => {
      // Only one primary contact per employee — cascade-unset any existing
      // one BEFORE creating, same reasoning as BankAccount.isPrimary below.
      if (form.isPrimary) {
        await tx.emergencyContact.updateMany({ where: { userId: id, isPrimary: true }, data: { isPrimary: false } })
      }
      return tx.emergencyContact.create({
        data: {
          userId: id,
          name: form.name.trim(),
          relationship: form.relationship.trim(),
          phone: form.phone.replace(/\D/g, ''),
          altPhone: form.altPhone.trim() || null,
          address: form.address.trim() || null,
          isPrimary: form.isPrimary,
        },
      })
    })

    return NextResponse.json({ contact }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
