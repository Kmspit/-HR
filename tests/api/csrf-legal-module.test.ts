import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    case:                { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    caseCourt:           { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    caseChecklist:       { deleteMany: vi.fn() },
    caseFinancial:       { upsert: vi.fn() },
    caseTimeline:        { create: vi.fn().mockResolvedValue({}) },
    billingInvoice:      { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    debtor:              { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    debtorFile:          { findUnique: vi.fn(), delete: vi.fn() },
    promiseToPay:        { update: vi.fn() },
    recoveryPayment:     { findUnique: vi.fn(), update: vi.fn() },
    clientCompany:       { update: vi.fn(), delete: vi.fn() },
    clientCompanyFile:   { findUnique: vi.fn(), delete: vi.fn() },
    caseExpense:         { update: vi.fn(), delete: vi.fn() },
    caseIncome:          { update: vi.fn(), delete: vi.fn() },
    courtEvent:          { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}))

vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  sendLineMessage:    vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/automation-engine', () => ({
  triggerAutomation: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('cloudinary', () => ({
  v2: { config: vi.fn(), uploader: { destroy: vi.fn().mockResolvedValue({}) } },
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { auth } from '@/lib/auth'
import { PATCH as casePatch, DELETE as caseDelete } from '@/app/api/cases/[id]/route'
import { PATCH as courtPatch, DELETE as courtDelete } from '@/app/api/cases/[id]/court/[courtId]/route'
import { DELETE as checklistDelete } from '@/app/api/cases/[id]/checklist/route'
import { PATCH as financialPatch } from '@/app/api/cases/[id]/financial/route'
import { PATCH as invoicePatch, DELETE as invoiceDelete } from '@/app/api/invoices/[id]/route'
import { PATCH as debtorPatch, DELETE as debtorDelete } from '@/app/api/debtors/[id]/route'
import { DELETE as debtorFileDelete } from '@/app/api/debtors/[id]/files/route'
import { PATCH as promisePatch } from '@/app/api/debtors/[id]/promises/route'
import { PATCH as paymentPatch } from '@/app/api/recovery/payments/[id]/route'
import { PATCH as companyPatch, DELETE as companyDelete } from '@/app/api/client-companies/[id]/route'
import { DELETE as companyFileDelete } from '@/app/api/client-companies/[id]/files/route'
import { PATCH as expensePatch, DELETE as expenseDelete } from '@/app/api/case-finance/expenses/[id]/route'
import { PATCH as incomePatch, DELETE as incomeDelete } from '@/app/api/case-finance/income/[id]/route'
import { POST as courtEventPost } from '@/app/api/court-events/route'
import { PATCH as courtEventPatch, DELETE as courtEventDelete } from '@/app/api/court-events/[id]/route'

const execSession = { user: { id: 'hr-1', role: 'HR', name: 'HR', department: null } }
const params = Promise.resolve({ id: 'x' })
const courtParams = Promise.resolve({ id: 'x', courtId: 'y' })

function crossOriginReq(method: string, body?: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/x', {
    method,
    headers: {
      'Content-Type': 'application/json',
      origin: 'https://evil.example.com',
      host: 'localhost',
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
}

describe('CSRF protection on PATCH/DELETE endpoints across the legal-case-management module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(execSession as never)
  })

  const cases: Array<[string, () => Promise<Response>]> = [
    ['PATCH /api/cases/[id]',                     () => casePatch(crossOriginReq('PATCH', {}), { params })],
    ['DELETE /api/cases/[id]',                    () => caseDelete(crossOriginReq('DELETE'), { params })],
    ['PATCH /api/cases/[id]/court/[courtId]',      () => courtPatch(crossOriginReq('PATCH', {}), { params: courtParams })],
    ['DELETE /api/cases/[id]/court/[courtId]',     () => courtDelete(crossOriginReq('DELETE'), { params: courtParams })],
    ['DELETE /api/cases/[id]/checklist',           () => checklistDelete(crossOriginReq('DELETE'), { params })],
    ['PATCH /api/cases/[id]/financial',            () => financialPatch(crossOriginReq('PATCH', {}), { params })],
    ['PATCH /api/invoices/[id]',                   () => invoicePatch(crossOriginReq('PATCH', {}), { params })],
    ['DELETE /api/invoices/[id]',                  () => invoiceDelete(crossOriginReq('DELETE'), { params })],
    ['PATCH /api/debtors/[id]',                    () => debtorPatch(crossOriginReq('PATCH', {}), { params })],
    ['DELETE /api/debtors/[id]',                   () => debtorDelete(crossOriginReq('DELETE'), { params })],
    ['DELETE /api/debtors/[id]/files',              () => debtorFileDelete(crossOriginReq('DELETE', { fileId: 'f' }), { params })],
    ['PATCH /api/debtors/[id]/promises',           () => promisePatch(crossOriginReq('PATCH', { promiseId: 'p', status: 'KEPT' }), { params })],
    ['PATCH /api/recovery/payments/[id]',          () => paymentPatch(crossOriginReq('PATCH', {}), { params })],
    ['PATCH /api/client-companies/[id]',           () => companyPatch(crossOriginReq('PATCH', {}), { params })],
    ['DELETE /api/client-companies/[id]',          () => companyDelete(crossOriginReq('DELETE'), { params })],
    ['DELETE /api/client-companies/[id]/files',    () => companyFileDelete(crossOriginReq('DELETE', { fileId: 'f' }), { params })],
    ['PATCH /api/case-finance/expenses/[id]',      () => expensePatch(crossOriginReq('PATCH', {}), { params })],
    ['DELETE /api/case-finance/expenses/[id]',     () => expenseDelete(crossOriginReq('DELETE'), { params })],
    ['PATCH /api/case-finance/income/[id]',        () => incomePatch(crossOriginReq('PATCH', {}), { params })],
    ['DELETE /api/case-finance/income/[id]',       () => incomeDelete(crossOriginReq('DELETE'), { params })],
    ['POST /api/court-events',                     () => courtEventPost(crossOriginReq('POST', { caseId: 'c', courtName: 'x', appointmentDate: '2026-08-01' }))],
    ['PATCH /api/court-events/[id]',               () => courtEventPatch(crossOriginReq('PATCH', {}), { params })],
    ['DELETE /api/court-events/[id]',              () => courtEventDelete(crossOriginReq('DELETE'), { params })],
  ]

  it.each(cases)('%s rejects a cross-origin request with 403 before touching the database', async (_name, call) => {
    const res = await call()
    expect(res.status).toBe(403)
  })
})
