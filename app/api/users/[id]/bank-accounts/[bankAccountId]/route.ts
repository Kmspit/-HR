import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { requireAuth, requireEditOrgScope, isGuardResponse } from '@/lib/api-guard'
import { encryptField, decryptField, FIELD_SALTS } from '@/lib/field-crypto'
import { validateBankAccountRow } from '@/lib/employee-subrecords-validation'
import { createAuditLog } from '@/lib/notifications'
import {
  summarizeBankAccountUpdate,
  summarizeBankAccountDisable,
  summarizeBankAccountReactivate,
  type BankAccountAuditRow,
} from '@/lib/subrecord-audit'
import type { Prisma } from '@prisma/client'

function requestIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

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

    const accountNumberTouched = form.accountNumber !== undefined

    // accountNumberEnc is always selected (cheap column) but only decrypted
    // below when this edit actually touches accountNumber — see
    // subrecord-audit.ts's header comment.
    const beforeRow = await prisma.bankAccount.findFirst({
      where: { id: bankAccountId, userId: id },
      select: {
        bankCode: true, accountNameEnc: true, accountNumberLast4: true, accountNumberEnc: true,
        accountType: true, isPrimary: true, isActive: true,
      },
    })
    if (!beforeRow) return NextResponse.json({ error: 'ไม่พบข้อมูล' }, { status: 404 })

    const before: BankAccountAuditRow = {
      bankCode: beforeRow.bankCode,
      accountName: decryptField(beforeRow.accountNameEnc, FIELD_SALTS.BANK_ACCOUNT),
      accountNumberLast4: beforeRow.accountNumberLast4,
      accountType: beforeRow.accountType,
      isPrimary: beforeRow.isPrimary,
      isActive: beforeRow.isActive,
      ...(accountNumberTouched
        ? { accountNumberPlain: decryptField(beforeRow.accountNumberEnc, FIELD_SALTS.BANK_ACCOUNT) }
        : {}),
    }

    const data: Prisma.BankAccountUpdateManyMutationInput = {}
    if (form.bankCode) data.bankCode = form.bankCode
    if (form.accountName) data.accountNameEnc = encryptField(form.accountName.trim(), FIELD_SALTS.BANK_ACCOUNT)
    if (!isActiveOnly) data.accountType = form.accountType.trim() || null
    let afterAccountNumberPlain: string | null = null
    if (accountNumberTouched) {
      const digits = (form.accountNumber as string).replace(/[\s-]/g, '')
      data.accountNumberEnc = encryptField(digits, FIELD_SALTS.BANK_ACCOUNT)
      data.accountNumberLast4 = digits.slice(-4)
      afterAccountNumberPlain = digits
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

    const after: BankAccountAuditRow = {
      bankCode: (data.bankCode as string | undefined) ?? before.bankCode,
      accountName: form.accountName ? form.accountName.trim() : before.accountName,
      accountNumberLast4: accountNumberTouched ? (data.accountNumberLast4 as string) : before.accountNumberLast4,
      accountType: (data.accountType as string | null | undefined) ?? before.accountType,
      isPrimary: (data.isPrimary as boolean | undefined) ?? before.isPrimary,
      isActive: form.isActive ?? before.isActive,
      ...(accountNumberTouched ? { accountNumberPlain: afterAccountNumberPlain } : {}),
    }

    let event
    if (isActiveOnly && form.isActive === false) {
      event = summarizeBankAccountDisable(before)
    } else if (isActiveOnly && form.isActive === true) {
      event = summarizeBankAccountReactivate(before)
    } else {
      event = summarizeBankAccountUpdate(before, after)
    }

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
