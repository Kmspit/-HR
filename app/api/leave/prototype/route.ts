import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notifyRole, sendLineNotify } from '@/lib/notifications'
import { apiError, runNotify } from '@/lib/api-handler'
import { requirePrototypeBridgeSecret } from '@/lib/prototype-bridge'
import type { LeaveType } from '@prisma/client'

const VALID_TYPES: LeaveType[] = [
  'SICK', 'VACATION', 'PERSONAL', 'UNPAID',
  'FUNERAL', 'WEDDING', 'MATERNITY', 'ORDINATION',
]

const CORS_ORIGINS = [
  'https://hrflow-app-gamma.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
  'http://localhost:5500',
]

function corsHeaders(origin: string | null): HeadersInit {
  const allow = !!origin && CORS_ORIGINS.some((o) => origin === o)
  return {
    'Access-Control-Allow-Origin': allow && origin ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function json(data: unknown, status = 200, origin: string | null = null) {
  return NextResponse.json(data, { status, headers: corsHeaders(origin) })
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get('origin')),
  })
}

/**
 * Bridge endpoint — รับคำขอลาจาก HTML prototype (ไม่ต้อง NextAuth session)
 * ค้นหา user จาก email แล้วสร้าง LeaveRequest ใน database
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const bridgeErr = requirePrototypeBridgeSecret(req)
  if (bridgeErr) {
    return json(
      await bridgeErr.json().catch(() => ({ ok: false, error: 'Forbidden' })),
      bridgeErr.status,
      origin,
    )
  }
  try {
    const body = await req.json() as {
      employeeEmail?: string
      type?: string
      startDate?: string
      endDate?: string
      days?: number
      reason?: string
    }

    const { employeeEmail, type, startDate, endDate, reason } = body

    if (!employeeEmail || !type || !startDate || !endDate || !reason) {
      return json({ ok: false, error: 'ข้อมูลไม่ครบ (employeeEmail, type, startDate, endDate, reason)' }, 400, origin)
    }

    if (!VALID_TYPES.includes(type as LeaveType)) {
      return json({ ok: false, error: `ประเภทลาไม่ถูกต้อง: ${type}` }, 400, origin)
    }

    // หา user จาก email
    const user = await prisma.user.findUnique({
      where: { email: employeeEmail.toLowerCase() },
      select: { id: true, name: true, status: true },
    })

    if (!user) {
      return json({
        ok: false,
        reason: 'user_not_found',
        error: `ไม่พบ user (${employeeEmail}) ในระบบ — บันทึกไว้ใน localStorage เท่านั้น`,
      }, 200, origin)
    }

    if (user.status !== 'ACTIVE') {
      return json({ ok: false, reason: 'user_inactive', error: 'บัญชีผู้ใช้ไม่ได้ใช้งาน' }, 200, origin)
    }

    // คำนวณจำนวนวัน
    const start = new Date(startDate)
    const end   = new Date(endDate)
    const days  = body.days ?? Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)

    const leave = await prisma.leaveRequest.create({
      data: {
        userId: user.id,
        type: type as LeaveType,
        startDate: start,
        endDate: end,
        days,
        reason,
        status: 'PENDING',
      },
    })

    // แจ้งเตือน HR/Admin
    await runNotify(() =>
      notifyRole('ADMIN', 'LEAVE_REQUEST', '📅 คำขอลาใหม่', `${user.name} ขอลา ${days} วัน`, '/approval-center'),
    )
    await runNotify(() =>
      notifyRole('MANAGER_HR', 'LEAVE_REQUEST', '📅 คำขอลาใหม่', `${user.name} ขอลา ${days} วัน`, '/approval-center'),
    )
    await runNotify(() =>
      sendLineNotify(`\n📅 คำขอลาใหม่\nชื่อ: ${user.name}\nประเภท: ${type}\nช่วงวัน: ${startDate} – ${endDate}\nเหตุผล: ${reason}`),
    )

    return json({ ok: true, id: leave.id, days }, 200, origin)
  } catch (err) {
    return apiError(err)
  }
}
