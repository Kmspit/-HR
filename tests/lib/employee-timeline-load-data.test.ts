import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ensure-payroll-payslip-columns', () => ({
  ensurePayrollPayslipColumns: vi.fn().mockResolvedValue(undefined),
}))

import { loadEmployeeTimeline } from '@/lib/employee-timeline/load-data'

function emptyPrismaMock() {
  const findMany = vi.fn().mockResolvedValue([])
  return {
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'emp-1', name: 'A', employeeId: 'E1', department: 'IT', position: 'Dev', role: 'EMPLOYEE', startDate: null }) },
    attendance: { findMany },
    leaveRequest: { findMany },
    outsideWorkRequest: { findMany },
    warning: { findMany },
    payroll: { findMany },
    auditLog: { findMany },
    leaveApprovalStep: { findMany },
    outsideWorkApprovalStep: { findMany },
    forgotScanApprovalStep: { findMany },
    weeklyPlanApprovalStep: { findMany },
    forgotScanRequest: { findMany },
  }
}

describe('loadEmployeeTimeline', () => {
  beforeEach(() => vi.clearAllMocks())

  it('excludes soft-deleted payroll rows from the timeline', async () => {
    const prisma = emptyPrismaMock()

    await loadEmployeeTimeline(prisma as any, 'emp-1', true)

    expect(prisma.payroll.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
    )
  })

  it('backlog 4.3 — does not even query payroll/salary-audit rows when canViewSalary is false', async () => {
    const otherFindMany = vi.fn().mockResolvedValue([])
    const payrollFindMany = vi.fn().mockResolvedValue([])
    const auditLogFindMany = vi.fn().mockResolvedValue([])
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'emp-1', name: 'A', employeeId: 'E1', department: 'IT', position: 'Dev', role: 'EMPLOYEE', startDate: null }) },
      attendance: { findMany: otherFindMany },
      leaveRequest: { findMany: otherFindMany },
      outsideWorkRequest: { findMany: otherFindMany },
      warning: { findMany: otherFindMany },
      payroll: { findMany: payrollFindMany },
      auditLog: { findMany: auditLogFindMany },
      leaveApprovalStep: { findMany: otherFindMany },
      outsideWorkApprovalStep: { findMany: otherFindMany },
      forgotScanApprovalStep: { findMany: otherFindMany },
      weeklyPlanApprovalStep: { findMany: otherFindMany },
      forgotScanRequest: { findMany: otherFindMany },
    }

    await loadEmployeeTimeline(prisma as any, 'emp-1', false)

    expect(payrollFindMany).not.toHaveBeenCalled()
    expect(auditLogFindMany).not.toHaveBeenCalled()
  })

  it('backlog 4.3 — payroll baseSalary never appears in the rendered timeline when canViewSalary is false', async () => {
    const emptyFindMany = vi.fn().mockResolvedValue([])
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'emp-1', name: 'A', employeeId: 'E1', department: 'IT', position: 'Dev', role: 'EMPLOYEE', startDate: null }) },
      attendance: { findMany: emptyFindMany },
      leaveRequest: { findMany: emptyFindMany },
      outsideWorkRequest: { findMany: emptyFindMany },
      warning: { findMany: emptyFindMany },
      payroll: { findMany: vi.fn().mockResolvedValue([{
        id: 'pay-1', month: 9, year: 2026, baseSalary: 30000, netSalary: 28500,
        lateDeduction: 0, absentDeduction: 0, status: 'APPROVED',
        createdAt: new Date(), updatedAt: new Date(),
      }]) },
      auditLog: { findMany: emptyFindMany },
      leaveApprovalStep: { findMany: emptyFindMany },
      outsideWorkApprovalStep: { findMany: emptyFindMany },
      forgotScanApprovalStep: { findMany: emptyFindMany },
      weeklyPlanApprovalStep: { findMany: emptyFindMany },
      forgotScanRequest: { findMany: emptyFindMany },
    }

    const dataHidden = await loadEmployeeTimeline(prisma as any, 'emp-1', false)
    expect(dataHidden!.events.some((e) => e.category === 'payroll')).toBe(false)

    const dataVisible = await loadEmployeeTimeline(prisma as any, 'emp-1', true)
    expect(dataVisible!.events.some((e) => e.category === 'payroll' && e.details.includes('30,000'))).toBe(true)
  })
})
