import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { canManageUsers } from '@/lib/rbac'
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
        ...(body.steps ? {
          steps: {
            deleteMany: {},   // replace all steps
            create: body.steps.map((s) => ({
              stepOrder:   s.stepOrder,
              stepName:    s.stepName.trim(),
              approverRole: (s.approverRole as Role) || null,
              approverId:  s.approverId || null,
              canSkip:     s.canSkip ?? false,
            })),
          },
        } : {}),
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
