import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { isPdfFile, storeWarningPdf } from '@/lib/warning-pdf'
import { deliverWarningToEmployee, ensureWarningPdfStored } from '@/lib/warning-delivery'
import { canApproveWarning, canManageUsers } from '@/lib/access-control'
import { archiveExpiredWarnings } from '@/lib/warning-auto'
import {
  canViewUserRecord,
  isCompanyWideApprover,
  resolveOrgListScope,
  userIdFilterFromScope,
} from '@/lib/org-scope'
import type { Prisma, Role } from '@prisma/client'

const MAX_PDF_BYTES = 10 * 1024 * 1024

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const role = session.user.role as Role
    const isHR = canManageUsers(role)
    const canApprove = canApproveWarning(role)

    const { searchParams } = new URL(req.url)
    const targetUserId = searchParams.get('userId')
    const statusFilter  = searchParams.get('status')

    // Lazily archive expired warnings
    archiveExpiredWarnings().catch(() => {})

    if (isHR || canApprove) {
      const where: Prisma.WarningWhereInput = {}
      if (statusFilter) where.status = statusFilter as Prisma.WarningWhereInput['status']

      if (targetUserId) {
        const allowed = await canViewUserRecord(
          prisma,
          session.user.id,
          role,
          session.user.branchId,
          targetUserId,
        )
        if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        where.userId = targetUserId
      } else if (canApprove && !isCompanyWideApprover(role)) {
        const scope = await resolveOrgListScope(prisma, session.user.id, role)
        Object.assign(where, userIdFilterFromScope(scope))
      }

      const warnings = await prisma.warning.findMany({
        where,
        select: {
          id: true, userId: true, reason: true, description: true, fileUrl: true,
          sentToLine: true, lineDeliveryStatus: true, lineSentAt: true, lineUserId: true,
          lineErrorMessage: true, isAuto: true, month: true, year: true, lateCount: true,
          status: true, expiredAt: true, approvedAt: true, rejectedReason: true, createdAt: true,
          user:       { select: { id: true, name: true, employeeId: true, department: true, position: true } },
          approvedBy: { select: { id: true, name: true } },
          rejectedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      return NextResponse.json({ warnings })
    }

    // Employee: only their own APPROVED warnings
    const warnings = await prisma.warning.findMany({
      where: { userId: session.user.id, status: 'APPROVED' },
      select: {
        id: true, userId: true, reason: true, description: true, fileUrl: true,
        sentToLine: true, lineDeliveryStatus: true, lineSentAt: true, lineUserId: true,
        lineErrorMessage: true, isAuto: true, month: true, year: true, lateCount: true,
        status: true, expiredAt: true, approvedAt: true, rejectedReason: true, createdAt: true,
        user: { select: { id: true, name: true, employeeId: true, department: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ warnings })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const issuerRole = session.user.role as Role
    if (!canApproveWarning(issuerRole) && !canManageUsers(issuerRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const contentType = req.headers.get('content-type') ?? ''
    let userId: string
    let reason: string
    let description: string | null = null
    let sendToEmployee = true
    let pdfFile: File | null = null

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      userId = (formData.get('userId') as string) || ''
      reason = (formData.get('reason') as string) || ''
      description = (formData.get('description') as string) || null
      sendToEmployee = formData.get('sendToEmployee') !== 'false'
      const file = formData.get('file') as File | null
      if (file && file.size > 0) pdfFile = file
    } else {
      const body = await req.json()
      userId = body.userId
      reason = body.reason
      description = body.description
      sendToEmployee = body.sendToEmployee !== false
    }

    if (!userId || !reason) {
      return NextResponse.json({ error: 'กรุณาเลือกพนักงานและระบุเหตุผล' }, { status: 400 })
    }

    // Company-wide roles (HR/CEO/SUPER_ADMIN/ADMIN/MANAGER_HR) may warn anyone.
    // Everyone else who reaches this point may only warn employees within their
    // own scope: MANAGER/TEAM_LEADER via the usual org-hierarchy (direct
    // reports) check also used by the GET handler above; ENFORCEMENT has no
    // "direct reports" concept, so its scope is same-department instead.
    if (!isCompanyWideApprover(issuerRole)) {
      let inScope: boolean
      if (issuerRole === 'ENFORCEMENT') {
        const target = await prisma.user.findUnique({ where: { id: userId }, select: { department: true } })
        inScope = !!session.user.department && session.user.department === target?.department
      } else {
        inScope = await canViewUserRecord(
          prisma,
          session.user.id,
          issuerRole,
          session.user.branchId,
          userId,
        )
      }
      if (!inScope) {
        return NextResponse.json({ error: 'คุณไม่มีสิทธิ์ออกใบเตือนพนักงานคนนี้ (อยู่นอกสายบังคับบัญชา/แผนกของคุณ)' }, { status: 403 })
      }
    }

    if (pdfFile) {
      if (!isPdfFile(pdfFile)) {
        return NextResponse.json({ error: 'อนุญาตเฉพาะไฟล์ PDF' }, { status: 400 })
      }
      if (pdfFile.size > MAX_PDF_BYTES) {
        return NextResponse.json({ error: 'ไฟล์ PDF ต้องไม่เกิน 10 MB' }, { status: 400 })
      }
    }

    const priorCount = await prisma.warning.count({ where: { userId } })
    const levelToUse = Math.min(priorCount + 1, 3)
    const warningNumber = priorCount + 1

    const now = new Date()
    const expiredAt = new Date(now)
    expiredAt.setMonth(expiredAt.getMonth() + 12)

    const warning = await prisma.warning.create({
      data: {
        userId,
        issuedById: session.user.id,
        level: levelToUse,
        reason,
        description: description || null,
        fileUrl: null,
        pdfBase64: null,
        isAuto: false,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        status: 'APPROVED',
        expiredAt,
        approvedById: session.user.id,
        approvedAt: now,
      },
    })

    let fileUrl: string | null = null
    if (pdfFile) {
      try {
        const stored = await storeWarningPdf(warning.id, userId, pdfFile)
        if (!stored) {
          await prisma.warning.delete({ where: { id: warning.id } })
          return NextResponse.json({ error: 'บันทึกไฟล์ PDF ไม่สำเร็จ' }, { status: 500 })
        }
        fileUrl = stored.fileUrl
        await prisma.warning.update({
          where: { id: warning.id },
          data: { fileUrl: stored.fileUrl, pdfBase64: stored.pdfBase64 },
        })
      } catch (e) {
        await prisma.warning.delete({ where: { id: warning.id } })
        if (e instanceof Error && e.message === 'PDF_TOO_LARGE') {
          return NextResponse.json({ error: 'ไฟล์ PDF ต้องไม่เกิน 10 MB' }, { status: 400 })
        }
        return NextResponse.json({ error: 'บันทึกไฟล์ PDF ไม่สำเร็จ' }, { status: 500 })
      }
    }

    try {
      await ensureWarningPdfStored(warning.id)
    } catch (e) {
      console.error('[warning-pdf-auto]', e)
    }

    let delivery: Awaited<ReturnType<typeof deliverWarningToEmployee>> | null = null
    if (sendToEmployee) {
      delivery = await deliverWarningToEmployee(warning.id, { warningNumber })
    } else {
      await prisma.warning.update({
        where: { id: warning.id },
        data: { lineDeliveryStatus: null },
      })
      await prisma.notification.create({
        data: {
          userId,
          type: 'WARNING_ISSUED',
          title: `ได้รับใบเตือน (ครั้งที่ ${warningNumber})`,
          message: reason,
          link: '/warnings',
        },
      }).catch((e) => console.error('[warning notify]', e))
    }

    const final = await prisma.warning.findUnique({
      where: { id: warning.id },
      select: { fileUrl: true },
    })

    return NextResponse.json({
      warning: { id: warning.id, fileUrl: final?.fileUrl ?? fileUrl },
      priorCount,
      warningNumber,
      levelUsed: levelToUse,
      fileUrl: final?.fileUrl ?? fileUrl,
      sent: sendToEmployee,
      lineDelivery: delivery
        ? {
            status: delivery.lineDeliveryStatus,
            sentAt: delivery.lineSentAt,
            lineUserId: delivery.lineUserId,
            errorMessage: delivery.lineErrorMessage,
          }
        : null,
    })
  } catch (err) {
    return apiError(err)
  }
}
