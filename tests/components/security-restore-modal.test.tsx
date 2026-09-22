// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import SecurityClient from '@/app/(dashboard)/security/SecurityClient'

afterEach(() => cleanup())

const BACKUP = {
  id: 'backup-1', filename: 'backup-2026-09-01.json', sizeBytes: 4_100_000, status: 'COMPLETED',
  tables: 'users,payrolls', storagePublicId: 'cloudinary-id-1', createdAt: '2026-09-01T00:00:00.000Z', note: null,
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('/api/security/dashboard')) return { ok: true, json: async () => null } as Response
    if (url.startsWith('/api/security/2fa')) return { ok: true, json: async () => ({ enabled: false, channel: 'LINE', enabledAt: null }) } as Response
    if (url.startsWith('/api/backup')) return { ok: true, json: async () => ({ records: [BACKUP] }) } as Response
    return { ok: true, json: async () => ({}) } as Response
  }))
})

/**
 * Mobile audit fix (2026-09-22) — the "กู้คืนข้อมูล" (restore backup) modal's
 * panel used max-h-[85vh] with no dvh fallback. Same failure mode as
 * BiometricConsentModal.tsx before its fix: on a real mobile browser with
 * visible toolbar chrome, vh overstates the actually visible height. This
 * panel scrolls its whole content as one unit (overflow-y-auto directly on
 * the panel, not a separate inner list), so the dvh fix is the only change
 * needed — no separate footer that could be clipped.
 */
describe('SecurityClient "กู้คืนข้อมูล" modal — dvh fix', () => {
  it('panel lists both max-h-[85vh] (fallback) and max-h-[85dvh] (fix), dvh listed after vh', async () => {
    render(<SecurityClient />)

    fireEvent.click(screen.getByRole('button', { name: /สำรองข้อมูล/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'กู้คืนข้อมูล' }))

    const dialog = await screen.findByRole('dialog', { name: 'กู้คืนข้อมูลจาก backup' })
    const vhIndex = dialog.className.indexOf('max-h-[85vh]')
    const dvhIndex = dialog.className.indexOf('max-h-[85dvh]')
    expect(vhIndex).toBeGreaterThanOrEqual(0)
    expect(dvhIndex).toBeGreaterThan(vhIndex)
    // still scrolls as one unit — unchanged by this fix
    expect(dialog.className).toContain('overflow-y-auto')
  })

  it('still shows the backup filename and table selector inside the modal (behavior unchanged)', async () => {
    render(<SecurityClient />)

    fireEvent.click(screen.getByRole('button', { name: /สำรองข้อมูล/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'กู้คืนข้อมูล' }))

    const dialog = await screen.findByRole('dialog', { name: 'กู้คืนข้อมูลจาก backup' })
    expect(within(dialog).getByText('backup-2026-09-01.json')).toBeTruthy()
    expect(within(dialog).getByLabelText('เลือกตารางที่จะกู้คืน')).toBeTruthy()
  })
})
