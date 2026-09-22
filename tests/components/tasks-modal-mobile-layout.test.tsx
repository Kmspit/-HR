// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/lib/client-api', () => ({
  apiJson: vi.fn().mockResolvedValue({ ok: true, data: {}, status: 200 }),
}))

import { TaskDetailModal, CreateTaskModal } from '@/app/(dashboard)/tasks/TasksModal'
import type { Task, UserSnip } from '@/app/(dashboard)/tasks/tasks-constants'

afterEach(() => cleanup())

const ASSIGNEE: UserSnip = { id: 'u1', name: 'พนักงาน หนึ่ง', department: null, employeeId: null, role: 'EMPLOYEE' }

const TASK: Task = {
  id: 't1', title: 'งานทดสอบ', description: null, type: 'GENERAL', priority: 'NORMAL', status: 'PENDING',
  assigneeId: 'u1', assignedById: 'u2', startDate: null, dueDate: null, notes: null, resultNote: null,
  resultUrl: null, submittedAt: null, reviewNote: null, reviewedAt: null, createdAt: '2026-01-01T00:00:00.000Z',
  taskLinks: null, progressNotes: null, assignee: ASSIGNEE, assignedBy: ASSIGNEE, caseNumber: null,
  clientName: null, taskDepartment: null, appointmentDate: null, courtDate: null, appointmentPlace: null,
  dueTime: null, slaHours: null, slaDeadline: null, templateId: null, debtorId: null, rejectedCount: 0,
}

/**
 * Mobile audit fixes (2026-09-22):
 * - Part C (group 4): the modal panel's dvh sizing regressed to plain vh
 *   once the md breakpoint (768px) kicked in — a phone in landscape is
 *   often wider than that while still showing browser toolbar chrome.
 *   Fixed by listing md:max-h-[Ndvh] after md:max-h-[Nvh] so it wins the
 *   cascade where supported.
 * - Part D (group 5): the footer button bar used a plain pb-5, letting it
 *   crowd or sit under the iPhone home-indicator/Android gesture bar on the
 *   mobile bottom-sheet layout. Fixed with the same env(safe-area-inset-
 *   bottom) pattern Sidebar.tsx already uses.
 */
describe('TaskDetailModal — mobile layout fixes', () => {
  it('panel lists md:max-h-[90vh] (fallback) and md:max-h-[90dvh] (fix), dvh listed after vh', () => {
    render(<TaskDetailModal task={TASK} role="HR" userId="u2" onClose={vi.fn()} onUpdated={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: 'งานทดสอบ' })
    const panel = dialog.querySelector('[tabindex="-1"]') as HTMLElement
    const vhIndex = panel.className.indexOf('md:max-h-[90vh]')
    const dvhIndex = panel.className.indexOf('md:max-h-[90dvh]')
    expect(vhIndex).toBeGreaterThanOrEqual(0)
    expect(dvhIndex).toBeGreaterThan(vhIndex)
  })

  it('footer "ปิด" button bar uses pb-[max(env(safe-area-inset-bottom),1.25rem)], not a plain pb-5', () => {
    render(<TaskDetailModal task={TASK} role="HR" userId="u2" onClose={vi.fn()} onUpdated={vi.fn()} />)
    // "ปิด" matches both the header icon-close button (aria-label="ปิด") and
    // the footer's full-width text button — the footer one is the last of
    // the two in DOM order.
    const closeBtns = screen.getAllByRole('button', { name: 'ปิด' })
    const footerCloseBtn = closeBtns[closeBtns.length - 1]
    const footer = footerCloseBtn.parentElement
    expect(footer?.className).toContain('pb-[max(env(safe-area-inset-bottom),1.25rem)]')
    expect(footer?.className).not.toMatch(/\bpb-5\b/)
  })
})

describe('CreateTaskModal — mobile layout fixes', () => {
  it('panel lists md:max-h-[92vh] (fallback) and md:max-h-[92dvh] (fix), dvh listed after vh', () => {
    render(<CreateTaskModal employees={[ASSIGNEE]} assignerName="HR คนหนึ่ง" onClose={vi.fn()} onCreated={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: 'สร้างงาน / รับเรื่อง' })
    const panel = dialog.querySelector('[tabindex="-1"]') as HTMLElement
    const vhIndex = panel.className.indexOf('md:max-h-[92vh]')
    const dvhIndex = panel.className.indexOf('md:max-h-[92dvh]')
    expect(vhIndex).toBeGreaterThanOrEqual(0)
    expect(dvhIndex).toBeGreaterThan(vhIndex)
  })

  it('sticky submit-button footer uses pb-[max(env(safe-area-inset-bottom),1.25rem)], not a plain pb-5', () => {
    render(<CreateTaskModal employees={[ASSIGNEE]} assignerName="HR คนหนึ่ง" onClose={vi.fn()} onCreated={vi.fn()} />)
    const submitBtn = screen.getByRole('button', { name: /สร้างงาน \/ มอบหมาย/ })
    const footer = submitBtn.parentElement
    expect(footer?.className).toContain('pb-[max(env(safe-area-inset-bottom),1.25rem)]')
  })
})
