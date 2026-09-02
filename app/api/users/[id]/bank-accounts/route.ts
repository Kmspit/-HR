import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { requireAuth, requireEditOrgScope, isGuardResponse } from '@/lib/api-guard'
import { encryptField, FIELD_SALTS } from '@/lib/field-crypto'
import { validateBankAccountRow, bankAccountRowHasErrors } from '@/lib/employee-subrecords-validation'

function coerceForm(body: unknown) {
  const o = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  return {
    bankCode: typeof o.bankCode === 'string' ? o.bankCode : '',
    accountNumber: typeof o.accountNumber === 'string' ? o.accountNumber : '',
    accountName: typeof o.accountName === 'string' ? o.accountName : '',
    accountType: typeof o.accountType === 'string' ? o.accountType : '',
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
    const errors = validateBankAccountRow(form)
    if (bankAccountRowHasErrors(errors)) {
      return NextResponse.json({ error: Object.values(errors)[0] }, { status: 400 })
    }

    const accountNumber = form.accountNumber.replace(/[\s-]/g, '')

    const account = await prisma.$transaction(async (tx) => {
      // Only one primary account per employee — cascade-unset any existing
      // one BEFORE creating. Scoped to all rows regardless of isActive:
      // correctness (never two "true" primaries) matters more than whether
      // the previous primary happens to be disabled already.
      if (form.isPrimary) {
        await tx.bankAccount.updateMany({ where: { userId: id, isPrimary: true }, data: { isPrimary: false } })
      }
      return tx.bankAccount.create({
        data: {
          userId: id,
          bankCode: form.bankCode,
          accountNameEnc: encryptField(form.accountName.trim(), FIELD_SALTS.BANK_ACCOUNT),
          accountNumberEnc: encryptField(accountNumber, FIELD_SALTS.BANK_ACCOUNT),
          accountNumberLast4: accountNumber.slice(-4),
          accountType: form.accountType.trim() || null,
          isPrimary: form.isPrimary,
          isActive: true,
        },
        select: {
          id: true, bankCode: true, accountNumberLast4: true, accountType: true, isPrimary: true, isActive: true,
        },
      })
    })

    return NextResponse.json({ account: { ...account, accountName: form.accountName.trim() } }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
