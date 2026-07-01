import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { canManageUsers } from '@/lib/access-control'
import type { Role } from '@prisma/client'
import type { ChainEntityType } from '@/lib/approval-chain'
import { parseChainEntityType } from '@/lib/approval-chain-shared'

// GET — list chains (HR/Admin only), optional ?entityType=LEAVE|OUTSIDE_WORK|WEEKLY_PLAN|FORGOT_SCAN
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canManageUsers(session.user.role as Role)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const entityType = parseChainEntityType(new URL(req.url).searchParams.get('entityType'))

    const chains = await prisma.approvalChainConfig.findMany({
      where: entityType ? { entityType } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        steps: {
          orderBy: { stepOrder: 'asc' },
          include: { approver: { select: { id: true, name: true } } },
        },
      },
    })

    return NextResponse.json({ chains })
  } catch (err) {
    return apiError(err)
  }
}

// POST — create a new chain
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canManageUsers(session.user.role as Role)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const body = (await req.json()) as {
      name?: string
      description?: string
      entityType?: ChainEntityType
      isDefault?: boolean
      steps?: Array<{
        stepOrder: number
        stepName: string
        approverRole?: string
        approverId?: string
        canSkip?: boolean
      }>
    }

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'กรุณาระบุชื่อ chain' }, { status: 400 })
    }
    if (!body.steps?.length) {
      return NextResponse.json({ error: 'ต้องมีอย่างน้อย 1 ขั้นตอน' }, { status: 400 })
    }

    const parsed = parseChainEntityType(body.entityType)
    const entityType: ChainEntityType = parsed ?? 'LEAVE'

    // If setting as default, unset other defaults for same entityType first
    if (body.isDefault) {
      await prisma.approvalChainConfig.updateMany({
        where: { isDefault: true, entityType },
        data: { isDefault: false },
      })
    }

    const chain = await prisma.approvalChainConfig.create({
      data: {
        name:        body.name.trim(),
        description: body.description?.trim() || null,
        entityType,
        isDefault:   body.isDefault ?? false,
        createdById: session.user.id,
        steps: {
          create: body.steps.map((s) => ({
            stepOrder:   s.stepOrder,
            stepName:    s.stepName.trim(),
            approverRole: (s.approverRole as Role) || null,
            approverId:  s.approverId || null,
            canSkip:     s.canSkip ?? false,
          })),
        },
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    })

    return NextResponse.json({ success: true, chain })
  } catch (err) {
    return apiError(err)
  }
}
