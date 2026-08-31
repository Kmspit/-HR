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

    await loadEmployeeTimeline(prisma as any, 'emp-1')

    expect(prisma.payroll.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
    )
  })
})
