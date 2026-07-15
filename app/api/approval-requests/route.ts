import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { headers } from 'next/headers'
import { APPR_ROLES, HR_ADMIN } from '@/lib/module-gates'
import {
  isCompanyWideApprover,
  resolveOrgListScope,
} from '@/lib/org-scope'
import type { Prisma, Role } from '@prisma/client'
import { apiError } from '@/lib/api-handler'

export async function GET(req: NextRequest) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: userId, role } = session.user
  const sp = req.nextUrl.searchParams
  const status   = sp.get('status') ?? undefined
  const docType  = sp.get('docType') ?? undefined
  const mine     = sp.get('mine') === 'true'
  const pending  = sp.get('pending') === 'true'
  const page     = Math.max(1, Number(sp.get('page') ?? '1'))
  const take     = 50

  const where: Prisma.ApprovalRequestWhereInput = {}
  if (status)  where.status  = status as Prisma.ApprovalRequestWhereInput['status']
  if (docType) where.docType = docType

  const viewerRole = role as Role
  const isWide = HR_ADMIN.includes(viewerRole) || isCompanyWideApprover(viewerRole)

  if (mine || (!isWide && !APPR_ROLES.includes(viewerRole))) {
    where.requestedById = userId
  } else if (pending) {
    if (isWide) {
      where.steps = {
        some: {
          status: 'PENDING',
          OR: [{ approverId: userId }, { approverRole: role }],
        },
      }
    } else {
      const scope = await resolveOrgListScope(prisma, userId, viewerRole)
      where.OR = [
        { steps: { some: { status: 'PENDING', approverId: userId } } },
        ...(scope !== 'ALL'
          ? [{
              requestedById: { in: scope },
              steps: { some: { status: 'PENDING', approverRole: role } },
            }]
          : [{
              steps: { some: { status: 'PENDING', approverRole: role } },
            }]),
      ]
    }
  }

  const [total, items] = await Promise.all([
    prisma.approvalRequest.count({ where }),
    prisma.approvalRequest.findMany({
      where,
      include: {
        requestedBy: { select: { id: true, name: true, role: true } },
        steps: {
          orderBy: { stepOrder: 'asc' },
          include: {
            actor:    { select: { id: true, name: true } },
            approver: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * take,
      take,
    }),
  ])

  return NextResponse.json({ items, total, page, pages: Math.ceil(total / take) })
} catch (err) {
  return apiError(err)
 }
}

type StepInput = {
  stepOrder: number
  stepName: string
  approverRole?: string
  approverId?: string
}

export async function POST(req: NextRequest) {
 try {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ip = (await headers()).get('x-forwarded-for') ?? 'unknown'
  const body = await req.json()
  const { docType, docId, docRef, title, amount, note, priority, steps } = body

  if (!docType || !docId || !title) {
    return NextResponse.json({ error: 'docType, docId, title are required' }, { status: 400 })
  }

  const stepsArr: StepInput[] = Array.isArray(steps) && steps.length > 0
    ? steps
    : [{ stepOrder: 1, stepName: 'อนุมัติ', approverRole: 'MANAGER_HR' }]

  const approvalRequest = await prisma.approvalRequest.create({
    data: {
      docType,
      docId,
      docRef:       docRef ?? null,
      title,
      requestedById: session.user.id,
      amount:        amount ? Number(amount) : null,
      currentStep:   1,
      totalSteps:    stepsArr.length,
      status:       'PENDING',
      priority:     priority ?? 'NORMAL',
      note:         note ?? null,
      steps: {
        create: stepsArr.map((s) => ({
          stepOrder:   s.stepOrder,
          stepName:    s.stepName,
          approverRole: s.approverRole ?? null,
          approverId:   s.approverId ?? null,
          status:      s.stepOrder === 1 ? 'PENDING' : 'WAITING',
        })),
      },
    },
    include: { steps: true },
  })

  await prisma.activityLog.create({
    data: {
      actorId:   session.user.id,
      actorName: session.user.name ?? '',
      docType,
      docId,
      docRef:    docRef ?? null,
      action:   'CREATED',
      detail:   `สร้างคำขออนุมัติ: ${title}`,
      ip,
    },
  })

  const step1 = stepsArr.find((s) => s.stepOrder === 1)
  if (step1) {
    if (step1.approverId) {
      await createNotification({
        userId: step1.approverId,
        type:   'APPROVAL_REQUESTED',
        title:  `รอการอนุมัติ: ${title}`,
        message: `${step1.stepName} — ${docType}`,
        link:   '/approval-center',
      })
    } else if (step1.approverRole) {
      const approvers = await prisma.user.findMany({
        where: { role: step1.approverRole as never, status: 'ACTIVE' },
        select: { id: true },
      })
      if (approvers.length > 0) {
        await prisma.notification.createMany({
          data: approvers.map((u) => ({
            userId:  u.id,
            type:    'APPROVAL_REQUESTED' as const,
            title:   `รอการอนุมัติ: ${title}`,
            message: `${step1.stepName} — ${docType}`,
            link:    '/approval-center',
          })),
        })
      }
    }
  }

  return NextResponse.json(approvalRequest, { status: 201 })
} catch (err) {
  return apiError(err)
 }
}
