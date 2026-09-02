import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { requireAuth, requireEditOrgScope, isGuardResponse } from '@/lib/api-guard'
import { encryptField, FIELD_SALTS } from '@/lib/field-crypto'
import { validateBankAccountRow } from '@/lib/employee-subrecords-validation'
import type { Prisma } from '@prisma/client'

function coercePatch(body: unknown) {
  const o = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  return {
    bankCode: typeof o.bankCode === 'string' ? o.bankCode : '',
    accountName: typeof o.accountName === 'string' ? o.accountName : '',
    accountType: typeof o.accountType === 'string' ? o.accountType : '',
    isPrimary: o.isPrimary === true,
    isActive: typeof o.isActive === 'boolean' ? o.isActive : undefined,
    // Present only after an explicit reveal-then-edit (see the .../sensitive
    // route) — same contract as dependents' nationalId. accountName has no
    // such gate (already shown decrypted in the list), so it's always sent.
    accountNumber: typeof o.accountNumber === 'string' ? o.accountNumber : undefined,
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; bankAccountId: string }> },
) {
  try {
    const session = await requireAuth()
    if (isGuardResponse(session)) return session

    const { id, bankAccountId } = await params
    if (id !== session.user.id) {
      const scopeCheck = await requireEditOrgScope(id)
      if (isGuardResponse(scopeCheck)) return scopeCheck
    }

    const form = coercePatch(await req.json())

    // isActive-only PATCH (the "delete" button — set isActive:false, never
    // a real DELETE, per the schema comment on BankAccount) skips the full
    // row validation entirely, since a disabled account is not required to
    // still satisfy the create-time field rules.
    const isActiveOnly = form.isActive !== undefined
      && !form.bankCode && !form.accountName && form.accountNumber === undefined

    if (!isActiveOnly) {
      const errors = validateBankAccountRow({
        bankCode: form.bankCode,
        accountName: form.accountName,
        accountNumber: form.accountNumber ?? '9999999999', // placeholder — untouched accountNumber is not being re-validated
        accountType: form.accountType,
        isPrimary: form.isPrimary,
      })
      // Only surface bankCode/accountName errors when accountNumber itself
      // wasn't actually submitted (the placeholder above must never trip
      // its own validation and mask a real error).
      if (errors.bankCode || errors.accountName || (form.accountNumber !== undefined && errors.accountNumber)) {
        return NextResponse.json({ error: errors.bankCode ?? errors.accountName ?? errors.accountNumber }, { status: 400 })
      }
    }

    const data: Prisma.BankAccountUpdateManyMutationInput = {}
    if (form.bankCode) data.bankCode = form.bankCode
    if (form.accountName) data.accountNameEnc = encryptField(form.accountName.trim(), FIELD_SALTS.BANK_ACCOUNT)
    if (!isActiveOnly) data.accountType = form.accountType.trim() || null
    if (form.accountNumber !== undefined) {
      const digits = form.accountNumber.replace(/[\s-]/g, '')
      data.accountNumberEnc = encryptField(digits, FIELD_SALTS.BANK_ACCOUNT)
      data.accountNumberLast4 = digits.slice(-4)
    }
    if (form.isActive !== undefined) data.isActive = form.isActive

    const updated = await prisma.$transaction(async (tx) => {
      if (form.isActive === false) {
        // A disabled account can't stay marked primary — "primary" should
        // mean "the one actively used for payroll", not a leftover flag on
        // an account nobody transfers to anymore. Does not auto-promote a
        // replacement; that's a separate, deliberate action for HR to take.
        data.isPrimary = false
      } else if (form.isPrimary) {
        await tx.bankAccount.updateMany({
          where: { userId: id, isPrimary: true, NOT: { id: bankAccountId } },
          data: { isPrimary: false },
        })
        data.isPrimary = true
      } else if (!isActiveOnly) {
        data.isPrimary = false
      }
      const result = await tx.bankAccount.updateMany({ where: { id: bankAccountId, userId: id }, data })
      return result.count
    })

    if (updated === 0) return NextResponse.json({ error: 'ไม่พบข้อมูล' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
