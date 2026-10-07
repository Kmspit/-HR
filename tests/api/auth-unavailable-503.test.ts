import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const auth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => auth() }))
vi.mock('@/lib/prisma', () => ({ prisma: { clientCompany: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn() } } }))

import { SessionUnavailableError } from '@/lib/session-validate'
import { GET as clientsGET } from '@/app/api/clients/route'
import { requireAuth, isGuardResponse } from '@/lib/api-guard'
import { requireActiveStaffSession } from '@/lib/session-guard'

beforeEach(() => {
  auth.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('DB down while checking the session → 503, never 401', () => {
  it('route that calls auth() outside try (authOrUnavailable)', async () => {
    auth.mockRejectedValue(new SessionUnavailableError(new Error('down')))
    const res = await clientsGET(new NextRequest('https://app.test/api/clients'))
    expect(res.status).toBe(503)
  })

  it('same route still answers 401 when the session is really gone', async () => {
    auth.mockResolvedValue(null)
    const res = await clientsGET(new NextRequest('https://app.test/api/clients'))
    expect(res.status).toBe(401)
  })

  it('requireAuth (api-guard)', async () => {
    auth.mockRejectedValue(new SessionUnavailableError())
    const r = await requireAuth()
    expect(isGuardResponse(r) && r.status).toBe(503)
  })

  it('requireActiveStaffSession', async () => {
    auth.mockRejectedValue(new SessionUnavailableError())
    expect(await requireActiveStaffSession()).toMatchObject({ ok: false, status: 503 })
  })

  it('other errors are not swallowed as 503', async () => {
    auth.mockRejectedValue(new Error('bug'))
    await expect(requireAuth()).rejects.toThrow('bug')
  })
})
