// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/hooks/useAnnouncementStream', () => ({ useAnnouncementStream: vi.fn() }))
vi.mock('@/lib/client-api', () => ({
  apiJson: vi.fn().mockResolvedValue({ ok: true, data: { announcements: [] }, status: 200 }),
  apiErrorMessage: vi.fn().mockReturnValue('error'),
}))

import AnnouncementsClient from '@/app/(dashboard)/announcements/AnnouncementsClient'

afterEach(() => cleanup())

const ORG_DATA = { branches: [], divisions: [], departments: [], sections: [] }

/**
 * Mobile audit fix (2026-09-22, part C / group 4) — the Archive modal's
 * panel used sm:max-h-[70vh] with no dvh fallback once the sm breakpoint
 * (640px) kicked in — a phone in landscape is often wider than that while
 * still showing browser toolbar chrome, silently reintroducing the same
 * failure mode BiometricConsentModal.tsx was already fixed for. Fix adds
 * sm:max-h-[70dvh] after it so it wins the cascade where supported.
 */
describe('AnnouncementsClient Archive modal — sm: breakpoint dvh fix', () => {
  it('panel lists sm:max-h-[70vh] (fallback) and sm:max-h-[70dvh] (fix), dvh listed after vh', async () => {
    render(
      <AnnouncementsClient
        announcements={[]}
        role="HR"
        userId="u1"
        orgData={ORG_DATA as unknown as Parameters<typeof AnnouncementsClient>[0]['orgData']}
      />,
    )

    // Two "Archive" trigger buttons exist (desktop + mobile responsive
    // variants) — either opens the same modal, so just click the first.
    fireEvent.click(screen.getAllByRole('button', { name: /Archive/i })[0])

    const dialog = await screen.findByRole('dialog', { name: 'ประกาศ Archive' })
    const vhIndex = dialog.className.indexOf('sm:max-h-[70vh]')
    const dvhIndex = dialog.className.indexOf('sm:max-h-[70dvh]')
    expect(vhIndex).toBeGreaterThanOrEqual(0)
    expect(dvhIndex).toBeGreaterThan(vhIndex)
    // the base (below-sm) dvh sizing is unchanged by this fix
    expect(dialog.className).toContain('max-h-[80dvh]')
  })
})
