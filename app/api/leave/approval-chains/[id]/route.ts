import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { canManageUsers } from '@/lib/access-control'
import type { ChainEntityType } from '@/lib/approval-chain'
import { parseChainEntityType } from '@/lib/approval-chain-shared'
import type { Role } from '@prisma/client'

type Params = { params: Promise<{ id: string }> }

// GET — single chain
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canManageUsers(session.user.role as Role)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const { id } = await params
    const chain = await prisma.approvalChainConfig.findUnique({
      where: { id },
      include: {
        steps: {
          orderBy: { stepOrder: 'asc' },
          include: { approver: { select: { id: true, name: true } } },
        },
      },
    })
    if (!chain) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ chain })
  } catch (err) {
    return apiError(err)
  }
}

// PUT — update chain (name, description, isActive, isDefault, steps replaced)
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canManageUsers(session.user.role as Role)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const { id } = await params
    const body = (await req.json()) as {
      name?: string
      description?: string
      entityType?: ChainEntityType
      isActive?: boolean
      isDefault?: boolean
      steps?: Array<{
        stepOrder: number
        stepName: string
        approverRole?: string
        approverId?: string
        canSkip?: boolean
      }>
    }

    const existing = await prisma.approvalChainConfig.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // If setting as default, unset other defaults for same entityType first
    if (body.isDefault && !existing.isDefault) {
      await prisma.approvalChainConfig.updateMany({
        where: { isDefault: true, entityType: existing.entityType, id: { not: id } },
        data: { isDefault: false },
      })
    }

    if (body.steps) {
      // Steps are referenced by real leave/outside-work/weekly-plan/forgot-scan
      // approval-step rows via a required chainStepId FK. A blind
      // deleteMany+create here throws a foreign-key violation as soon as a
      // chain has ever been used. Diff by stepOrder instead: update steps
      // whose position still exists in place (preserves their id, so history
      // stays intact), only delete positions being dropped, and refuse to
      // drop a position that history still points to.
      const incoming = body.steps
      const result = await prisma.$transaction(async (tx) => {
        const existingSteps = await tx.approvalChainStep.findMany({ where: { chainId: id } })
        const existingByOrder = new Map(existingSteps.map((s) => [s.stepOrder, s]))
        const incomingOrders = new Set(incoming.map((s) => s.stepOrder))
        const toRemove = existingSteps.filter((s) => !incomingOrders.has(s.stepOrder))

        const blockedNames: string[] = []
        for (const s of toRemove) {
          const dependentCount =
            (await tx.leaveApprovalStep.count({ where: { chainStepId: s.id } })) +
            (await tx.outsideWorkApprovalStep.count({ where: { chainStepId: s.id } })) +
            (await tx.weeklyPlanApprovalStep.count({ where: { chainStepId: s.id } })) +
            (await tx.forgotScanApprovalStep.count({ where: { chainStepId: s.id } }))
          if (dependentCount > 0) blockedNames.push(s.stepName)
        }
        if (blockedNames.length > 0) {
          return { blockedNames }
        }

        for (const s of toRemove) {
          await tx.approvalChainStep.delete({ where: { id: s.id } })
        }
        for (const s of incoming) {
          const data = {
            stepName:     s.stepName.trim(),
            approverRole: (s.approverRole as Role) || null,
            approverId:   s.approverId || null,
            canSkip:      s.canSkip ?? false,
          }
          const existingStep = existingByOrder.get(s.stepOrder)
          if (existingStep) {
            await tx.approvalChainStep.update({ where: { id: existingStep.id }, data })
          } else {
            await tx.approvalChainStep.create({ data: { chainId: id, stepOrder: s.stepOrder, ...data } })
          }
        }
        return { blockedNames: [] as string[] }
      })

      if (result.blockedNames.length > 0) {
        return NextResponse.json(
          {
            error: `ไม่สามารถลบขั้นตอน "${result.blockedNames.join(', ')}" ได้ เนื่องจากมีคำขอที่เคยใช้ขั้นตอนนี้แล้ว — หากต้องการเปลี่ยนโครงสร้างขั้นตอน กรุณาสร้าง chain ใหม่แทนการแก้ไข chain นี้`,
          },
          { status: 409 },
        )
      }
    }

    const chain = await prisma.approvalChainConfig.update({
      where: { id },
      data: {
        ...(body.name        !== undefined ? { name:        body.name.trim() }              : {}),
        ...(body.description !== undefined ? { description: body.description?.trim() || null } : {}),
        ...(body.entityType !== undefined
          ? { entityType: parseChainEntityType(body.entityType) ?? existing.entityType }
          : {}),
        ...(body.isActive    !== undefined ? { isActive:    body.isActive }                 : {}),
        ...(body.isDefault   !== undefined ? { isDefault:   body.isDefault }                : {}),
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    })

    return NextResponse.json({ success: true, chain })
  } catch (err) {
    return apiError(err)
  }
}

// DELETE — soft-delete by marking isActive=false (not hard delete — might have existing leave)
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!canManageUsers(session.user.role as Role)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const { id } = await params
    await prisma.approvalChainConfig.update({
      where: { id },
      data: { isActive: false, isDefault: false },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
