import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyRole } from '@/lib/notifications'
import { apiError, runNotify } from '@/lib/api-handler'
import { ensureDbSchema } from '@/lib/ensure-db-schema'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await ensureDbSchema()

    const canViewAll = ['MANAGER_HR', 'ADMIN', 'HR', 'SUPER_ADMIN', 'CEO'].includes(session.user.role)
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
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const {
      date, startTime, endTime, place, purpose, client, note, googleMapsUrl,
      attachmentUrl, attachmentName,
      employeeName, ownerName, workType, distance, distanceLimit, routeType,
      timeSlot, caseNumber, productWork, workBranch, caseCount, adminChecked, supervisedBy,
    } = body

    if (!date || !place || !purpose) {
      return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 })
    }

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
        approvalStatus: 'pending_ceo',
      },
    })

    await runNotify(() =>
      notifyRole(
        'CEO',
        'OUTSIDE_REQUEST',
        'คำขอออกนอกสถานที่ — รอ CEO อนุมัติ',
        `${session.user.name} ขอออกนอกสถานที่วันที่ ${new Date(date).toLocaleDateString('th-TH')}`,
        '/approvals',
      ),
    )

    return NextResponse.json({ success: true, request })
  } catch (err) {
    return apiError(err)
  }
}
