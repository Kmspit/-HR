import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { getDefaultChain, applyChainToOutsideWork } from '@/lib/approval-chain'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })    const canViewAll = ['MANAGER_HR', 'ADMIN', 'HR', 'SUPER_ADMIN', 'CEO'].includes(session.user.role)
    const { searchParams } = new URL(req.url)
    const filterUserId = searchParams.get('userId')

    const where = canViewAll
      ? filterUserId
        ? { userId: filterUserId }
        : {}
      : { userId: session.user.id }

    const requests = await prisma.outsideWorkRequest.findMany({
      where,
      include: { user: { select: { name: true, department: true, position: true } } },
      orderBy: { createdAt: 'desc' },
      take: canViewAll ? 200 : 100,
    })

    return NextResponse.json({ requests })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })    const body = await req.json()
    const {
      date, startTime, endTime, place, purpose, client, note, googleMapsUrl,
      attachmentUrl, attachmentName,
      employeeName, ownerName, workType, distance, distanceLimit, routeType,
      timeSlot, caseNumber, productWork, workBranch, caseCount, adminChecked, supervisedBy,
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

    const refreshed = await prisma.outsideWorkRequest.findUnique({ where: { id: request.id } })

    return NextResponse.json({ success: true, request: refreshed ?? request, chainApplied: true })
  } catch (err) {
    return apiError(err)
  }
}
