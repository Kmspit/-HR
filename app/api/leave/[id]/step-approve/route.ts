import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { executeLeaveStepAction } from '@/lib/approval-chain'
import { createAuditLog } from '@/lib/notifications'
import { requireCsrf } from '@/lib/api-guard'
import type { Role } from '@prisma/client'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const csrfErr = requireCsrf(req)
    if (csrfErr) return csrfErr

    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: actorId, role } = session.user
    const { id: leaveId } = await params

    const body = (await req.json()) as {
      action: 'APPROVE' | 'REJECT'
      comment?: string
    }

    if (!['APPROVE', 'REJECT'].includes(body.action)) {
      return NextResponse.json({ error: 'action ต้องเป็น APPROVE หรือ REJECT' }, { status: 400 })
    }

    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'

    const result = await executeLeaveStepAction(
      prisma,
      leaveId,
      actorId,
      role as Role,
      body.action,
      body.comment,
      ip,
    )

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    await createAuditLog({
      actorId,
      targetId:   leaveId,
      targetType: 'LeaveRequest',
      action:     body.action === 'APPROVE' ? 'APPROVE' : 'REJECT',
      after:      { stepName: result.stepName, finalized: result.finalized },
      ip,
    })

    return NextResponse.json(result)
  } catch (err) {
    return apiError(err)
  }
}
