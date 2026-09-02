import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { requireAuth, requireOrgScope, isGuardResponse } from '@/lib/api-guard'
import { decryptField, FIELD_SALTS } from '@/lib/field-crypto'

/**
 * Combined read for the "ผู้ติดต่อ & บัญชีธนาคาร" tab (Phase 1 step 8b) —
 * one fetch instead of 3, same reasoning as the profile tab's single GET.
 * Only accountName is decrypted here (needed to tell accounts apart at a
 * glance); accountNumber/dependent nationalId stay last-4-only — full
 * values are HR_ADMIN + audit-logged via the separate .../sensitive routes.
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

    const [emergencyContacts, dependents, bankAccounts] = await Promise.all([
      prisma.emergencyContact.findMany({
        where: { userId: id },
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.dependent.findMany({
        where: { userId: id },
        select: {
          id: true, name: true, relationType: true, birthDate: true,
          nationalIdLast4: true, isTaxAllowance: true, note: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.bankAccount.findMany({
        where: { userId: id },
        select: {
          id: true, bankCode: true, accountNameEnc: true, accountNumberLast4: true,
          accountType: true, isPrimary: true, isActive: true,
        },
        orderBy: [{ isActive: 'desc' }, { isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    ])

    return NextResponse.json({
      emergencyContacts,
      dependents: dependents.map((d) => ({
        id: d.id,
        name: d.name,
        relationType: d.relationType,
        birthDate: d.birthDate ? d.birthDate.toISOString().slice(0, 10) : null,
        nationalIdLast4: d.nationalIdLast4,
        isTaxAllowance: d.isTaxAllowance,
        note: d.note,
      })),
      bankAccounts: bankAccounts.map((b) => ({
        id: b.id,
        bankCode: b.bankCode,
        accountName: decryptField(b.accountNameEnc, FIELD_SALTS.BANK_ACCOUNT),
        accountNumberLast4: b.accountNumberLast4,
        accountType: b.accountType,
        isPrimary: b.isPrimary,
        isActive: b.isActive,
      })),
    })
  } catch (err) {
    return apiError(err)
  }
}
