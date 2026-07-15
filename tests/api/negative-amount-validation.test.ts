import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    recoveryPayment: { create: vi.fn() },
    debtor:          { findUnique: vi.fn() },
    debtPayment:     { create: vi.fn() },
    caseExpense:     { create: vi.fn() },
    caseIncome:      { create: vi.fn() },
    expenseClaim:    { create: vi.fn() },
    billingInvoice:  { create: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    user:            { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

vi.mock('@/lib/debtor-access', () => ({
  checkDebtorAccess: vi.fn().mockResolvedValue({ status: 'ok' }),
}))

vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/line-notifications', () => ({
  sendLineApprovalRequest: vi.fn().mockResolvedValue(undefined),
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { POST as recoveryPaymentsPost } from '@/app/api/recovery/payments/route'
import { POST as debtorPaymentsPost } from '@/app/api/debtors/[id]/payments/route'
import { POST as caseExpensePost } from '@/app/api/case-finance/expenses/route'
import { POST as caseIncomePost } from '@/app/api/case-finance/income/route'
import { POST as expenseClaimPost } from '@/app/api/expense-claims/route'
import { POST as invoicePost } from '@/app/api/invoices/route'

const managerSession = { user: { id: 'mgr-1', role: 'MANAGER', name: 'Manager', department: 'Legal' } }
const financeSession = { user: { id: 'fin-1', role: 'ADMIN', name: 'Finance Admin', department: 'Finance' } }

function jsonReq(url: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('Negative-amount validation (Phase A) — every money-touching create route rejects amount <= 0', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(managerSession as never)
    vi.mocked(prisma.debtor.findUnique).mockResolvedValue({
      id: 'debtor-1', paidAmount: 0, totalDebt: 1000, assignedToId: null, firstName: 'A', lastName: 'B',
    } as never)
  })

  it('POST /api/recovery/payments rejects a negative amount with 400, never reaches create', async () => {
    const res = await recoveryPaymentsPost(jsonReq('http://localhost/api/recovery/payments', {
      debtorId: 'debtor-1', paymentType: 'CASH', amount: -500,
      paymentDate: '2026-07-15', paymentMethod: 'CASH',
    }))
    expect(res.status).toBe(400)
    expect(prisma.recoveryPayment.create).not.toHaveBeenCalled()
  })

  it('POST /api/recovery/payments accepts a positive amount', async () => {
    vi.mocked(prisma.recoveryPayment.create).mockResolvedValue({ id: 'p1', amount: 500 } as never)
    const res = await recoveryPaymentsPost(jsonReq('http://localhost/api/recovery/payments', {
      debtorId: 'debtor-1', paymentType: 'CASH', amount: 500,
      paymentDate: '2026-07-15', paymentMethod: 'CASH',
    }))
    expect(res.status).toBe(201)
    expect(prisma.recoveryPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 500 }) }),
    )
  })

  it('POST /api/debtors/[id]/payments rejects a negative amount, never touches the debtor balance', async () => {
    const res = await debtorPaymentsPost(
      jsonReq('http://localhost/api/debtors/debtor-1/payments', { amount: -100, paidAt: '2026-07-15', channel: 'CASH' }),
      { params: Promise.resolve({ id: 'debtor-1' }) },
    )
    expect(res.status).toBe(400)
    expect(prisma.debtPayment.create).not.toHaveBeenCalled()
  })

  it('POST /api/case-finance/expenses rejects a negative amount', async () => {
    const res = await caseExpensePost(jsonReq('http://localhost/api/case-finance/expenses', {
      expenseType: 'ค่าเดินทาง', amount: -200, date: '2026-07-15', employeeId: 'emp-1',
    }))
    expect(res.status).toBe(400)
    expect(prisma.caseExpense.create).not.toHaveBeenCalled()
  })

  it('POST /api/case-finance/income rejects a negative amount', async () => {
    const res = await caseIncomePost(jsonReq('http://localhost/api/case-finance/income', {
      incomeType: 'ค่าธรรมเนียม', amount: -300, date: '2026-07-15',
    }))
    expect(res.status).toBe(400)
    expect(prisma.caseIncome.create).not.toHaveBeenCalled()
  })

  it('POST /api/expense-claims rejects a negative amount — the netProfit-inversion bug', async () => {
    const res = await expenseClaimPost(jsonReq('http://localhost/api/expense-claims', {
      title: 'เบิกค่าน้ำมัน', expenseType: 'travel', amount: -1000, date: '2026-07-15',
    }))
    expect(res.status).toBe(400)
    expect(prisma.expenseClaim.create).not.toHaveBeenCalled()
  })

  it('POST /api/invoices rejects a negative subtotal', async () => {
    vi.mocked(auth).mockResolvedValue(financeSession as never)
    const res = await invoicePost(jsonReq('http://localhost/api/invoices', {
      clientName: 'Client A', serviceType: 'Legal', subtotal: -5000,
      issueDate: '2026-07-15', dueDate: '2026-07-30',
    }))
    expect(res.status).toBe(400)
    expect(prisma.billingInvoice.create).not.toHaveBeenCalled()
  })

  it('POST /api/invoices rejects an out-of-range whtRate (e.g. > 1 / > 100%)', async () => {
    vi.mocked(auth).mockResolvedValue(financeSession as never)
    const res = await invoicePost(jsonReq('http://localhost/api/invoices', {
      clientName: 'Client A', serviceType: 'Legal', subtotal: 5000, whtRate: 1.5,
      issueDate: '2026-07-15', dueDate: '2026-07-30',
    }))
    expect(res.status).toBe(400)
    expect(prisma.billingInvoice.create).not.toHaveBeenCalled()
  })

  it('POST /api/invoices accepts valid values and computes totals correctly', async () => {
    vi.mocked(auth).mockResolvedValue(financeSession as never)
    vi.mocked(prisma.billingInvoice.create).mockResolvedValue({ id: 'inv-1' } as never)
    const res = await invoicePost(jsonReq('http://localhost/api/invoices', {
      clientName: 'Client A', serviceType: 'Legal', subtotal: 1000, vatRate: 0.07, whtRate: 0.03,
      issueDate: '2026-07-15', dueDate: '2026-07-30',
    }))
    expect(res.status).toBe(201)
    expect(prisma.billingInvoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subtotal: 1000, vatAmount: 70, whtAmount: 30, totalAmount: 1040 }),
      }),
    )
  })
})
