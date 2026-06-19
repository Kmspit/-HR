import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildBranchScope, branchUserWhere, branchNestedUserWhere, parseBranchQueryParam } from '@/lib/branch-scope'
import { createAuditLog } from '@/lib/notifications'

const PAYROLL_ROLES = ['EMPLOYEE', 'MANAGER_HR', 'LAWYER'] as const

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))
  const userId = searchParams.get('userId')
  const branchParam = parseBranchQueryParam(searchParams.get('branchId') ?? undefined)
  const scope = buildBranchScope(session.user, { branchId: branchParam })
  const nestedUser = branchNestedUserWhere(scope)

  const isManager = ['MANAGER_HR', 'ADMIN', 'SUPER_ADMIN', 'HR'].includes(session.user.role)

  if (userId && userId !== session.user.id && !isManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (userId) {
    if (isManager && userId !== session.user.id) {
      const targetUser = await prisma.user.findFirst({
        where: branchUserWhere(scope, { id: userId }),
        select: { id: true },
      })
      if (!targetUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const payrolls = await prisma.payroll.findMany({
      where: { month, year, userId },
      include: {
        user: { select: { name: true, employeeId: true, department: true, position: true, socialSecurity: true } },
      },
    })
    return NextResponse.json({ payrolls, month, year, employeeCount: payrolls.length })
  }

  if (!isManager) {
    const payrolls = await prisma.payroll.findMany({
      where: { month, year, userId: session.user.id },
      include: {
        user: { select: { name: true, employeeId: true, department: true, position: true, socialSecurity: true } },
      },
    })
    return NextResponse.json({ payrolls, month, year, employeeCount: payrolls.length })
  }

  const [employees, payrollRecords] = await Promise.all([
    prisma.user.findMany({
      where: branchUserWhere(scope, { status: 'ACTIVE', role: { in: [...PAYROLL_ROLES] } }),
      select: {
        id: true,
        name: true,
        employeeId: true,
        department: true,
        position: true,
        socialSecurity: true,
        baseSalary: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.payroll.findMany({
      where: { month, year, ...(nestedUser ? { user: nestedUser } : {}) },
      include: {
        user: { select: { name: true, employeeId: true, department: true, position: true, socialSecurity: true } },
      },
    }),
  ])

  const payrollByUser = new Map(payrollRecords.map((p) => [p.userId, p]))

  const payrolls = employees.map((emp) => {
    const p = payrollByUser.get(emp.id)
    if (p) {
      return {
        id: p.id,
        userId: p.userId,
        name: p.user.name,
        employeeId: p.user.employeeId ?? '',
        department: p.user.department ?? '',
        position: p.user.position ?? '',
        socialSecurity: p.user.socialSecurity,
        baseSalary: p.baseSalary,
        lateDeduction: p.lateDeduction,
        absentDeduction: p.absentDeduction,
        unpaidLeave: p.unpaidLeave,
        ssDeduction: p.socialSecurity,
        taxDeduction: (p as unknown as { taxDeduction?: number }).taxDeduction ?? 0,
        taxDetail: (p as unknown as { taxDetail?: string }).taxDetail ?? null,
        netSalary: p.netSalary,
        lateDays: p.lateDays,
        absentDays: p.absentDays,
        lateMinutes: p.lateMinutes ?? 0,
        lateBillableMinutes: p.lateBillableMinutes ?? p.lateMinutes ?? 0,
        lateDeductionDetail: p.lateDeductionDetail,
        status: p.status,
        note: p.note,
        hasPayroll: true,
      }
    }
    return {
      id: `pending-${emp.id}`,
      userId: emp.id,
      name: emp.name,
      employeeId: emp.employeeId ?? '',
      department: emp.department ?? '',
      position: emp.position ?? '',
      socialSecurity: emp.socialSecurity,
      baseSalary: emp.baseSalary ?? 0,
      lateDeduction: 0,
      absentDeduction: 0,
      unpaidLeave: 0,
      ssDeduction: 0,
      taxDeduction: 0,
      taxDetail: null,
      netSalary: 0,
      lateDays: 0,
      absentDays: 0,
      lateMinutes: 0,
      lateBillableMinutes: 0,
      lateDeductionDetail: null,
      status: 'PENDING',
      note: null,
      hasPayroll: false,
    }
  })

  const lateSummary = {
    employeesWithLate: payrolls.filter((p) => p.lateDeduction > 0).length,
    totalLateDeduction: payrolls.reduce((s, p) => s + p.lateDeduction, 0),
    totalBillableLateMinutes: payrolls.reduce(
      (s, p) => s + (p.lateBillableMinutes ?? p.lateMinutes ?? 0),
      0,
    ),
  }

  return NextResponse.json({ payrolls, month, year, employeeCount: employees.length, lateSummary })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !['MANAGER_HR', 'ADMIN', 'SUPER_ADMIN', 'HR'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id, status, note } = await req.json()
  const updateData: Record<string, unknown> = { status }
  if (note !== undefined) updateData.note = note
  if (status === 'APPROVED') {
    updateData.approvedById = session.user.id
    updateData.approvedAt = new Date()
  }
  const payroll = await prisma.payroll.update({ where: { id }, data: updateData })

  if (status === 'APPROVED') {
    const taxRaw = (payroll as unknown as { taxDetail?: string }).taxDetail
    if (taxRaw) {
      try {
        const td = JSON.parse(taxRaw) as {
          annualGross?: number
          incomeDeduction?: number
          personalAllowance?: number
          taxableIncome?: number
          annualTax?: number
          monthlyWithholding?: number
        }
        await prisma.taxHistory.upsert({
          where: { userId_month_year: { userId: payroll.userId, month: payroll.month, year: payroll.year } },
          create: {
            userId: payroll.userId,
            month: payroll.month,
            year: payroll.year,
            annualGross: td.annualGross ?? 0,
            incomeDeduction: td.incomeDeduction ?? 0,
            personalAllowance: td.personalAllowance ?? 0,
            taxableIncome: td.taxableIncome ?? 0,
            annualTax: td.annualTax ?? 0,
            monthlyTax: td.monthlyWithholding ?? 0,
          },
          update: {
            annualGross: td.annualGross ?? 0,
            incomeDeduction: td.incomeDeduction ?? 0,
            personalAllowance: td.personalAllowance ?? 0,
            taxableIncome: td.taxableIncome ?? 0,
            annualTax: td.annualTax ?? 0,
            monthlyTax: td.monthlyWithholding ?? 0,
          },
        })
      } catch (e) { console.error('[payroll/report] DB error (non-critical):', e) }
    }

    try {
      await prisma.salarySlip.upsert({
        where: { payrollId: payroll.id },
        create: {
          payrollId: payroll.id,
          userId: payroll.userId,
          month: payroll.month,
          year: payroll.year,
        },
        update: { issuedAt: new Date() },
      })
    } catch (e) { console.error('[payroll/report] DB error (non-critical):', e) }
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  await createAuditLog({
    actorId: session.user.id,
    targetId: payroll.userId,
    targetType: 'Payroll',
    action: status === 'APPROVED' ? 'APPROVE' : status === 'REJECTED' ? 'REJECT' : 'UPDATE',
    after: { payrollId: payroll.id, status, month: payroll.month, year: payroll.year, note: note ?? null },
    ip,
    userAgent: req.headers.get('user-agent') ?? undefined,
  })

  return NextResponse.json({ payroll })
}
