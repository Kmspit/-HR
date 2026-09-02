import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { requireAuth, isGuardResponse } from '@/lib/api-guard'
import { decryptField, FIELD_SALTS } from '@/lib/field-crypto'
import { HR_ADMIN } from '@/lib/module-gates'
import { createAuditLog } from '@/lib/notifications'
import type { Role } from '@prisma/client'

/**
 * Reveals a bank account's full account number — same shape/reasoning as
 * the dependent nationalId .../sensitive route and the employee's own
 * .../sensitive route: HR_ADMIN only, every call audit-logged (success or
 * denied). accountName is NOT gated here — it's already shown decrypted in
 * the personal-records list (see that route's comment), so there's nothing
 * additional to reveal for it.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; bankAccountId: string }> },
) {
  try {
    const session = await requireAuth()
    if (isGuardResponse(session)) return session

    const { id, bankAccountId } = await params
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'

    if (!HR_ADMIN.includes(session.user.role as Role)) {
      await createAuditLog({
        actorId: session.user.id,
        targetId: id,
        targetType: 'BankAccountSensitiveData',
        action: 'VIEW',
        after: { result: 'FORBIDDEN', actorRole: session.user.role, bankAccountId },
        ip,
      })
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const account = await prisma.bankAccount.findFirst({
      where: { id: bankAccountId, userId: id },
      select: { accountNumberEnc: true },
    })
    if (!account) return NextResponse.json({ error: 'ไม่พบข้อมูล' }, { status: 404 })

    const accountNumber = decryptField(account.accountNumberEnc, FIELD_SALTS.BANK_ACCOUNT)

    await createAuditLog({
      actorId: session.user.id,
      targetId: id,
      targetType: 'BankAccountSensitiveData',
      action: 'VIEW',
      after: { result: 'SUCCESS', bankAccountId },
      ip,
    })

    return NextResponse.json({ accountNumber })
  } catch (err) {
    return apiError(err)
  }
}
