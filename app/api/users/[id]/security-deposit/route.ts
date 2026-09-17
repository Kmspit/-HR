import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { HR_ADMIN } from '@/lib/module-gates'
import { requireOrgScope, isGuardResponse } from '@/lib/api-guard'
import { createAuditLog } from '@/lib/notifications'
import { ensurePayrollFieldsBatch2 } from '@/lib/ensure-payroll-fields-batch-2'
import type { Role } from '@prisma/client'

function requestIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

/** เงินประกัน 6 งวด (หรือจำนวนงวดที่ตกลง) — payroll fields batch 2 (2026-09).
 * สร้าง/ยกเลิก "แผน" เท่านั้น งวดที่หักไปแล้วกี่งวด derive จาก Payroll จริง
 * ตอน generate เสมอ (ดู lib/payroll-security-deposit.ts) ไม่เก็บ counter ที่นี่ */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const scopeCheck = await requireOrgScope(id)
    if (isGuardResponse(scopeCheck)) return scopeCheck
    if (!HR_ADMIN.includes(scopeCheck.user.role as Role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    await ensurePayrollFieldsBatch2()

    const plan = await prisma.securityDepositPlan.findUnique({ where: { userId: id } })
    return NextResponse.json({ plan })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const scopeCheck = await requireOrgScope(id)
    if (isGuardResponse(scopeCheck)) return scopeCheck
    if (!HR_ADMIN.includes(scopeCheck.user.role as Role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    await ensurePayrollFieldsBatch2()
    const session = scopeCheck

    const body = await req.json() as {
      totalAmount?: number
      totalInstallments?: number
      startMonth?: number
      startYear?: number
    }

    const totalAmount = body.totalAmount
    const totalInstallments = body.totalInstallments
    const startMonth = body.startMonth
    const startYear = body.startYear

    if (typeof totalAmount !== 'number' || !Number.isFinite(totalAmount) || totalAmount <= 0) {
      return NextResponse.json({ error: 'totalAmount ต้องเป็นตัวเลขมากกว่า 0' }, { status: 400 })
    }
    if (typeof totalInstallments !== 'number' || !Number.isInteger(totalInstallments) || totalInstallments <= 0) {
      return NextResponse.json({ error: 'totalInstallments ต้องเป็นจำนวนเต็มมากกว่า 0' }, { status: 400 })
    }
    if (typeof startMonth !== 'number' || startMonth < 1 || startMonth > 12) {
      return NextResponse.json({ error: 'startMonth ไม่ถูกต้อง' }, { status: 400 })
    }
    if (typeof startYear !== 'number' || !Number.isInteger(startYear)) {
      return NextResponse.json({ error: 'startYear ไม่ถูกต้อง' }, { status: 400 })
    }

    // มีแผน ACTIVE อยู่แล้ว ต้องยกเลิกก่อนถึงจะสร้างใหม่ได้ (unique userId บน
    // model — @@unique เดี่ยว ไม่ใช่ compound เพราะออกแบบไว้ให้ 1 คนมีได้แค่
    // 1 แผนที่ผูกกับ record เดียว ไม่ history หลายแผนพร้อมกัน)
    const existing = await prisma.securityDepositPlan.findUnique({ where: { userId: id } })
    if (existing && existing.status === 'ACTIVE') {
      return NextResponse.json(
        { error: 'มีแผนเงินประกันที่ยัง ACTIVE อยู่แล้ว — ยกเลิกแผนเดิมก่อนสร้างใหม่' },
        { status: 400 },
      )
    }

    const plan = existing
      ? await prisma.securityDepositPlan.update({
          where: { userId: id },
          data: { totalAmount, totalInstallments, startMonth, startYear, status: 'ACTIVE' },
        })
      : await prisma.securityDepositPlan.create({
          data: { userId: id, totalAmount, totalInstallments, startMonth, startYear, status: 'ACTIVE' },
        })

    await createAuditLog({
      actorId: session.user.id,
      targetId: id,
      targetType: 'User',
      action: 'CREATE',
      after: { securityDepositPlanId: plan.id, totalAmount, totalInstallments, startMonth, startYear },
      ip: requestIp(req),
      userAgent: req.headers.get('user-agent') ?? undefined,
    })

    return NextResponse.json({ plan })
  } catch (err) {
    return apiError(err)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const scopeCheck = await requireOrgScope(id)
    if (isGuardResponse(scopeCheck)) return scopeCheck
    if (!HR_ADMIN.includes(scopeCheck.user.role as Role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    await ensurePayrollFieldsBatch2()
    const session = scopeCheck

    const body = await req.json() as { status?: string }
    if (body.status !== 'CANCELLED') {
      return NextResponse.json({ error: 'รองรับแค่ status: "CANCELLED" เท่านั้น' }, { status: 400 })
    }

    const existing = await prisma.securityDepositPlan.findUnique({ where: { userId: id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const plan = await prisma.securityDepositPlan.update({
      where: { userId: id },
      data: { status: 'CANCELLED' },
    })

    await createAuditLog({
      actorId: session.user.id,
      targetId: id,
      targetType: 'User',
      action: 'UPDATE',
      before: { securityDepositPlanStatus: existing.status },
      after: { securityDepositPlanStatus: 'CANCELLED' },
      ip: requestIp(req),
      userAgent: req.headers.get('user-agent') ?? undefined,
    })

    return NextResponse.json({ plan })
  } catch (err) {
    return apiError(err)
  }
}
