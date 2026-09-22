// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import ClientsClient from '@/app/(dashboard)/clients/ClientsClient'

afterEach(() => cleanup())

const CLIENT = {
  id: 'client-1', name: 'ลูกค้า ทดสอบ', email: 'client@test.com', phone: null,
  status: 'ACTIVE', department: null, createdAt: '2026-01-01T00:00:00.000Z',
  _count: { clientTasks: 0, clientDocs: 0 },
}
const CLIENT_DETAIL = { ...CLIENT, clientTasks: [], clientDocs: [] }

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('/api/clients/client-1')) {
      return { ok: true, json: async () => CLIENT_DETAIL } as Response
    }
    if (url.startsWith('/api/clients')) {
      return { ok: true, json: async () => [CLIENT] } as Response
    }
    if (url.startsWith('/api/tasks')) {
      return { ok: true, json: async () => ({ tasks: [{ id: 't1', title: 'คดี A', caseNumber: 'C-1', status: 'PENDING' }] }) } as Response
    }
    return { ok: true, json: async () => ({}) } as Response
  }))
})

/**
 * Mobile audit fix (2026-09-22) — the "เชื่อมคดี" (link task) modal's panel
 * used max-h-[80vh] with no dvh fallback. Same failure mode as
 * BiometricConsentModal.tsx before its fix: on a real mobile browser with
 * visible toolbar chrome, vh overstates the actually visible height. Fix
 * adds max-h-[80dvh] after the vh fallback (wins the cascade where
 * supported) — PortalModal's own backdrop already provides overflow-y-auto
 * as a safety net, unchanged by this fix.
 */
describe('ClientsClient "เชื่อมคดี" modal — dvh fix', () => {
  it('panel lists both max-h-[80vh] (fallback) and max-h-[80dvh] (fix), dvh listed after vh', async () => {
    render(<ClientsClient userId="hr-1" userRole="HR" />)

    fireEvent.click(await screen.findByText('ลูกค้า ทดสอบ'))
    fireEvent.click(await screen.findByRole('button', { name: 'เชื่อมคดี' }))

    const dialog = await screen.findByRole('dialog', { name: 'เลือกคดีที่จะเชื่อม' })
    const vhIndex = dialog.className.indexOf('max-h-[80vh]')
    const dvhIndex = dialog.className.indexOf('max-h-[80dvh]')
    expect(vhIndex).toBeGreaterThanOrEqual(0)
    expect(dvhIndex).toBeGreaterThan(vhIndex)
  })

  it('the inner task list still scrolls independently (flex-1 min-h-0 overflow-y-auto) so the "ปิด" button stays outside it', async () => {
    render(<ClientsClient userId="hr-1" userRole="HR" />)

    fireEvent.click(await screen.findByText('ลูกค้า ทดสอบ'))
    fireEvent.click(await screen.findByRole('button', { name: 'เชื่อมคดี' }))

    const closeBtn = await screen.findByRole('button', { name: 'ปิด' })
    const dialog = await screen.findByRole('dialog', { name: 'เลือกคดีที่จะเชื่อม' })
    const scrollableList = dialog.querySelector('.min-h-0.overflow-y-auto')
    expect(scrollableList?.contains(closeBtn)).toBe(false)
  })

  it('closing the modal via "ปิด" still works (behavior unchanged by the layout fix)', async () => {
    render(<ClientsClient userId="hr-1" userRole="HR" />)

    fireEvent.click(await screen.findByText('ลูกค้า ทดสอบ'))
    fireEvent.click(await screen.findByRole('button', { name: 'เชื่อมคดี' }))
    await screen.findByRole('dialog', { name: 'เลือกคดีที่จะเชื่อม' })

    fireEvent.click(screen.getByRole('button', { name: 'ปิด' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'เลือกคดีที่จะเชื่อม' })).toBeNull()
    })
  })
})
