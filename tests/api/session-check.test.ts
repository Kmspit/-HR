import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const readJwtSession = vi.fn()
const queryRaw = vi.fn()
vi.mock('@/lib/auth', () => ({ readJwtSession: () => readJwtSession() }))
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRawUnsafe: (...a: unknown[]) => queryRaw(...a) } }))

import { GET } from '@/app/api/auth/session-check/route'
import { getSessionCookieName } from '@/lib/session-token'

const req = () => new NextRequest('https://app.test/api/auth/session-check')
const jwt = { expires: '2099-01-01', user: { id: 'u1', role: 'HR', status: 'ACTIVE', sessionEpoch: 1 } }
const cookieCleared = (res: Response) =>
  (res.headers.get('set-cookie') ?? '').includes(`${getSessionCookieName()}=;`)

beforeEach(() => {
  readJwtSession.mockReset()
  queryRaw.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/auth/session-check', () => {
  it('valid session → role home page (role from DB), cookie kept', async () => {
    readJwtSession.mockResolvedValue(jwt)
    queryRaw.mockResolvedValue([{ status: 'ACTIVE', role: 'EMPLOYEE', branchId: null, department: null, sessionEpoch: 1 }])
    const res = await GET(req())
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location')!).pathname).not.toBe('/login')
    expect(cookieCleared(res)).toBe(false)
  })

  it.each([
    ['disabled', [{ status: 'DISABLED', role: 'HR', branchId: null, department: null, sessionEpoch: 1 }]],
    ['epoch bumped', [{ status: 'ACTIVE', role: 'HR', branchId: null, department: null, sessionEpoch: 2 }]],
    ['deleted user', []],
  ])('%s → cookie cleared + /login?reason=expired', async (_, rows) => {
    readJwtSession.mockResolvedValue(jwt)
    queryRaw.mockResolvedValue(rows)
    const res = await GET(req())
    const loc = new URL(res.headers.get('location')!)
    expect(loc.pathname).toBe('/login')
    expect(loc.searchParams.get('reason')).toBe('expired')
    expect(cookieCleared(res)).toBe(true)
  })

  it('DB down → 503 "ระบบขัดข้องชั่วคราว" page, cookie NOT cleared, no redirect to login', async () => {
    readJwtSession.mockResolvedValue(jwt)
    queryRaw.mockRejectedValue(new Error('fetch failed'))
    const res = await GET(req())
    expect(res.status).toBe(503)
    expect(res.headers.get('location')).toBeNull()
    expect(cookieCleared(res)).toBe(false)
    expect(await res.text()).toContain('ระบบขัดข้องชั่วคราว')
  })

  it('no JWT at all → /login', async () => {
    readJwtSession.mockResolvedValue(null)
    const res = await GET(req())
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login')
    expect(queryRaw).not.toHaveBeenCalled()
  })
})
