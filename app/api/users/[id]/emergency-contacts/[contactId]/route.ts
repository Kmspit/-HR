import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { requireAuth, requireEditOrgScope, isGuardResponse } from '@/lib/api-guard'
import { validateEmergencyContactRow, emergencyContactRowHasErrors } from '@/lib/employee-subrecords-validation'

function coercePatch(body: unknown) {
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  try {
    const session = await requireAuth()
    if (isGuardResponse(session)) return session

    const { id, contactId } = await params
    if (id !== session.user.id) {
      const scopeCheck = await requireEditOrgScope(id)
      if (isGuardResponse(scopeCheck)) return scopeCheck
    }

    const form = coercePatch(await req.json())
    const errors = validateEmergencyContactRow(form)
    if (emergencyContactRowHasErrors(errors)) {
      return NextResponse.json({ error: Object.values(errors)[0] }, { status: 400 })
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (form.isPrimary) {
        await tx.emergencyContact.updateMany({
          where: { userId: id, isPrimary: true, NOT: { id: contactId } },
          data: { isPrimary: false },
        })
      }
      // updateMany (ownership-scoped, not a bare .update by id) so a
      // contactId that belongs to a different employee 404s instead of
      // silently editing across employees.
      const result = await tx.emergencyContact.updateMany({
        where: { id: contactId, userId: id },
        data: {
          name: form.name.trim(),
          relationship: form.relationship.trim(),
          phone: form.phone.replace(/\D/g, ''),
          altPhone: form.altPhone.trim() || null,
          address: form.address.trim() || null,
          isPrimary: form.isPrimary,
        },
      })
      return result.count
    })

    if (updated === 0) return NextResponse.json({ error: 'ไม่พบข้อมูล' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  try {
    const session = await requireAuth()
    if (isGuardResponse(session)) return session

    const { id, contactId } = await params
    if (id !== session.user.id) {
      const scopeCheck = await requireEditOrgScope(id)
      if (isGuardResponse(scopeCheck)) return scopeCheck
    }

    const result = await prisma.emergencyContact.deleteMany({ where: { id: contactId, userId: id } })
    if (result.count === 0) return NextResponse.json({ error: 'ไม่พบข้อมูล' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
