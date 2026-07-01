import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { apiError, runNotify } from '@/lib/api-handler'
import { createNotification } from '@/lib/notifications'
import { saveUpload } from '@/lib/save-upload'
import { getDefaultChain } from '@/lib/approval-chain'
import { applyChainToForgotScan } from '@/lib/forgot-scan-chain'
import type { Prisma, Role } from '@prisma/client'
import {
  FORGOT_SCAN_HR_ROLES,
  FORGOT_SCAN_SUPERVISOR_ROLES,
} from '@/lib/access-control'

const SCAN_TYPES = ['checkin', 'lunch-out', 'lunch-in', 'checkout'] as const
type ScanType = (typeof SCAN_TYPES)[number]

const SCAN_TYPE_LABEL: Record<ScanType, string> = {
  checkin:     'เข้างาน',
  'lunch-out': 'พักกลางวันออก',
  'lunch-in':  'กลับจากพัก',
  checkout:    'ออกงาน',
}

const schema = z.object({
  date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD'),
  scanType:    z.enum(SCAN_TYPES),
  correctTime: z.string().regex(/^\d{2}:\d{2}$/, 'รูปแบบเวลาต้องเป็น HH:MM'),
  reason:      z.string().min(1, 'กรุณาระบุเหตุผล'),
})

const NOTIFY_ROLES: Role[] = ['MANAGER', 'TEAM_LEADER', 'HR', 'MANAGER_HR']

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const contentType = req.headers.get('content-type') ?? ''
    let parsed: z.infer<typeof schema>
    let evidenceUrl: string | undefined

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const body = {
        date:        String(formData.get('date') ?? ''),
        scanType:    String(formData.get('scanType') ?? ''),
        correctTime: String(formData.get('correctTime') ?? ''),
        reason:      String(formData.get('reason') ?? ''),
      }
      const result = schema.safeParse(body)
      if (!result.success) return NextResponse.json({ error: result.error.errors[0]?.message }, { status: 400 })
      parsed = result.data
      const file = formData.get('evidence') as File | null
      if (file && file.size > 0) {
        evidenceUrl = await saveUpload(file, 'forgot-scan', session.user.id)
      }
    } else {
      const body = await req.json()
      const result = schema.safeParse(body)
      if (!result.success) return NextResponse.json({ error: result.error.errors[0]?.message }, { status: 400 })
      parsed = result.data
    }

    const dateObj = new Date(`${parsed.date}T00:00:00+07:00`)
    const correctTimeObj = new Date(`${parsed.date}T${parsed.correctTime}:00+07:00`)

    const request = await prisma.forgotScanRequest.create({
      data: {
        userId:      session.user.id,
        date:        dateObj,
        scanType:    parsed.scanType,
        correctTime: correctTimeObj,
        reason:      parsed.reason,
        evidenceUrl,
        status:      'PENDING',
      },
    })

    const label = SCAN_TYPE_LABEL[parsed.scanType as ScanType]

    const chain = await getDefaultChain(prisma, 'FORGOT_SCAN')
    if (chain) {
      await applyChainToForgotScan(prisma, request.id, chain.id, session.user.id)
    } else {
      runNotify(async () => {
        const { notifyRole } = await import('@/lib/notifications')
        const userName = session.user.name ?? 'พนักงาน'
        for (const role of NOTIFY_ROLES) {
          await notifyRole(
            role,
            'FORGOT_SCAN_REQUEST',
            'คำขอแก้ไขเวลาลงเวลางาน',
            `${userName} ขอแก้ไขเวลา${label} (${parsed.date})`,
            '/approval-center',
          )
        }
      })
    }

    return NextResponse.json({ success: true, id: request.id })
  } catch (err) {
    return apiError(err)
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, id: userId } = session.user
    const url = new URL(req.url)
    const tab = url.searchParams.get('tab') ?? 'mine'

    const isHR = FORGOT_SCAN_HR_ROLES.includes(role as Role)
    const isSupervisor = FORGOT_SCAN_SUPERVISOR_ROLES.includes(role as Role)

    let where: Prisma.ForgotScanRequestWhereInput = {}

    if (tab === 'pending') {
      if (isHR) {
        where = { status: { in: ['PENDING', 'ADMIN_APPROVED'] } }
      } else if (isSupervisor) {
        where = { status: 'PENDING' }
      } else {
        where = { userId, status: { in: ['PENDING', 'ADMIN_APPROVED'] } }
      }
    } else {
      // 'mine' tab — own requests
      where = { userId }
    }

    const requests = await prisma.forgotScanRequest.findMany({
      where,
      include: {
        user:          { select: { id: true, name: true, employeeId: true, department: true } },
        supervisorRel: { select: { name: true } },
        hrRel:         { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return NextResponse.json({ requests })
  } catch (err) {
    return apiError(err)
  }
}
