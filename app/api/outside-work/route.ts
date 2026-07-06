import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { getDefaultChain, applyChainToOutsideWork } from '@/lib/approval-chain'
import { requireCsrf } from '@/lib/api-guard'
import {
  canViewUserRecord,
  isCompanyWideApprover,
  resolveOrgListScope,
  userIdFilterFromScope,
} from '@/lib/org-scope'
import type { Role } from '@prisma/client'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const filterUserId = searchParams.get('userId')
    const scope = await resolveOrgListScope(prisma, session.user.id, session.user.role as Role)

    let where = userIdFilterFromScope(scope)
    if (filterUserId) {
      const allowed = await canViewUserRecord(
        prisma,
        session.user.id,
        session.user.role as Role,
        session.user.branchId,
        filterUserId,
      )
      if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      where = { userId: filterUserId }
    }

    const requests = await prisma.outsideWorkRequest.findMany({
      where,
      select: {
        id: true, userId: true, date: true, startTime: true, endTime: true,
        place: true, purpose: true, client: true, note: true, status: true,
        chainConfigId: true, currentStepOrder: true, createdAt: true,
        googleMapsUrl: true, attachmentUrl: true, attachmentName: true, approvalStatus: true,
        employeeName: true, ownerName: true, workType: true, distance: true, distanceLimit: true, routeType: true,
        timeSlot: true, caseNumber: true, productWork: true, productCategory: true, productType: true,
        workBranch: true, caseCount: true, adminChecked: true, supervisedBy: true, documentNumber: true,
        user: { select: { name: true, department: true, position: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: isCompanyWideApprover(session.user.role as Role) ? 200 : 100,
    })

    return NextResponse.json({ requests })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const csrfErr = requireCsrf(req)
    if (csrfErr) return csrfErr

    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json()
    const {
      date, startTime, endTime, place, purpose, client, note, googleMapsUrl,
      attachmentUrl, attachmentName,
      employeeName, ownerName, workType, distance, distanceLimit, routeType,
      timeSlot, caseNumber, productWork, productCategory, productType, workBranch, caseCount, adminChecked, supervisedBy,
    } = body

    if (!date || !place || !purpose) {
      return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 })
    }

    const year  = new Date().getFullYear() + 543
    const count = await prisma.outsideWorkRequest.count()
    const documentNumber = `OW-${year}-${String(count + 1).padStart(3, '0')}`

    const request = await prisma.outsideWorkRequest.create({
      data: {
        userId: session.user.id,
        date: new Date(date),
        startTime:      startTime     || '',
        endTime:        endTime       || '',
        place,
        purpose,
        client:         client        || null,
        note:           note          || null,
        googleMapsUrl:  googleMapsUrl || null,
        attachmentUrl:  attachmentUrl || null,
        attachmentName: attachmentName || null,
        employeeName:   employeeName  || null,
        ownerName:      ownerName     || null,
        workType:       workType      || null,
        distance:       distance      ? Number(distance)      : null,
        distanceLimit:  distanceLimit ? Number(distanceLimit) : null,
        routeType:      routeType     || null,
        timeSlot:       timeSlot      || null,
        caseNumber:     caseNumber    || null,
        productWork:    productWork   || null,
        productCategory: productCategory || null,
        productType:     productType     || null,
        workBranch:     workBranch    || null,
        caseCount:      caseCount     ? Number(caseCount)     : null,
        adminChecked:   adminChecked  || null,
        supervisedBy:   supervisedBy  || null,
        documentNumber,
      },
    })

    const defaultChain = await getDefaultChain(prisma, 'OUTSIDE_WORK')
    if (!defaultChain) {
      return NextResponse.json(
        { error: 'ยังไม่ได้ตั้งค่าสายอนุมัติออกนอกสถานที่ — ติดต่อ HR', code: 'NO_CHAIN' },
        { status: 503 },
      )
    }
    await applyChainToOutsideWork(prisma, request.id, defaultChain.id, session.user.id)

    const refreshed = await prisma.outsideWorkRequest.findUnique({
      where: { id: request.id },
      select: {
        id: true, userId: true, date: true, startTime: true, endTime: true,
        place: true, purpose: true, client: true, note: true, status: true,
        chainConfigId: true, currentStepOrder: true, createdAt: true,
        googleMapsUrl: true, attachmentUrl: true, attachmentName: true, approvalStatus: true,
        employeeName: true, ownerName: true, workType: true, distance: true, distanceLimit: true, routeType: true,
        timeSlot: true, caseNumber: true, productWork: true, productCategory: true, productType: true,
        workBranch: true, caseCount: true, adminChecked: true, supervisedBy: true, documentNumber: true,
      },
    })

    return NextResponse.json({ success: true, request: refreshed ?? request, chainApplied: true })
  } catch (err) {
    return apiError(err)
  }
}
