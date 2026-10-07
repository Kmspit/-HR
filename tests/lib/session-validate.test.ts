import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Session } from 'next-auth'

const queryRaw = vi.fn()
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRawUnsafe: (...a: unknown[]) => queryRaw(...a) } }))

import {
  validateSessionAgainstDb,
  SessionUnavailableError,
  isSessionUnavailableError,
  SESSION_CHECK_TIMEOUT_MS,
} from '@/lib/session-validate'
import { SESSION_UNAVAILABLE_DIGEST } from '@/lib/session-constants'
import { apiError } from '@/lib/api-handler'

function jwtSession(over: Partial<Session['user']> = {}): Session {
  return {
    expires: '2099-01-01T00:00:00.000Z',
    user: {
      id: 'u1', email: 'e@x.test', name: 'E', role: 'HR', status: 'ACTIVE',
      department: 'old-dept', branchId: 'old-branch', sessionEpoch: 2, ...over,
    },
  }
}
const dbRow = (over: Record<string, unknown> = {}) => ({
  status: 'ACTIVE', role: 'HR', branchId: 'b1', department: 'd1', sessionEpoch: 2, ...over,
})

beforeEach(() => {
  queryRaw.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.useRealTimers())

describe('validateSessionAgainstDb', () => {
  it('no session / no user id → null without touching the DB', async () => {
    expect(await validateSessionAgainstDb(null)).toBeNull()
    expect(await validateSessionAgainstDb({ expires: '', user: {} } as unknown as Session)).toBeNull()
    expect(queryRaw).not.toHaveBeenCalled()
  })

  it('one primary-key query per call', async () => {
    queryRaw.mockResolvedValue([dbRow()])
    await validateSessionAgainstDb(jwtSession())
    expect(queryRaw).toHaveBeenCalledTimes(1)
    expect(queryRaw.mock.calls[0][0]).toMatch(/FROM users WHERE id = \? LIMIT 1/)
    expect(queryRaw.mock.calls[0][1]).toBe('u1')
  })

  it('valid → role/status/branchId/department come from the DB, not the JWT', async () => {
    queryRaw.mockResolvedValue([dbRow({ role: 'EMPLOYEE', branchId: 'new-branch', department: 'new-dept' })])
    const s = await validateSessionAgainstDb(jwtSession({ role: 'CEO' }))
    expect(s?.user).toMatchObject({ id: 'u1', role: 'EMPLOYEE', branchId: 'new-branch', department: 'new-dept', status: 'ACTIVE' })
  })

  it('deleted user → null', async () => {
    queryRaw.mockResolvedValue([])
    expect(await validateSessionAgainstDb(jwtSession())).toBeNull()
  })

  it.each(['DISABLED', 'PENDING', 'REJECTED'])('status %s → null', async (status) => {
    queryRaw.mockResolvedValue([dbRow({ status })])
    expect(await validateSessionAgainstDb(jwtSession())).toBeNull()
  })

  it('sessionEpoch bumped (password change / role change / termination) → null', async () => {
    queryRaw.mockResolvedValue([dbRow({ sessionEpoch: 3 })])
    expect(await validateSessionAgainstDb(jwtSession({ sessionEpoch: 2 }))).toBeNull()
  })

  it('epoch compare tolerates bigint from the driver and a JWT minted before epochs existed', async () => {
    queryRaw.mockResolvedValue([dbRow({ sessionEpoch: BigInt(2) })])
    expect(await validateSessionAgainstDb(jwtSession({ sessionEpoch: 2 }))).not.toBeNull()
    queryRaw.mockResolvedValue([dbRow({ sessionEpoch: 0 })])
    expect(await validateSessionAgainstDb(jwtSession({ sessionEpoch: undefined }))).not.toBeNull()
  })

  it('does NOT reject a session just because the account is locked from failed logins', async () => {
    // lockedUntil isn't even selected — failed-login lockout only blocks new logins
    queryRaw.mockResolvedValue([dbRow({ lockedUntil: new Date(Date.now() + 3600_000) })])
    expect(await validateSessionAgainstDb(jwtSession())).not.toBeNull()
    expect(queryRaw.mock.calls[0][0]).not.toMatch(/locked/i)
  })

  it('local DB without the sessionEpoch column → retries without it (epoch 0)', async () => {
    queryRaw
      .mockRejectedValueOnce(new Error('no such column: sessionEpoch'))
      .mockResolvedValueOnce([dbRow({ sessionEpoch: 0 })])
    expect(await validateSessionAgainstDb(jwtSession({ sessionEpoch: 0 }))).not.toBeNull()
    expect(queryRaw).toHaveBeenCalledTimes(2)
  })

  it('DB error → SessionUnavailableError (not null, so the caller never treats it as logged out)', async () => {
    queryRaw.mockRejectedValue(new Error('SERVER_ERROR: Server returned HTTP status 500'))
    const err = await validateSessionAgainstDb(jwtSession()).catch((e) => e)
    expect(err).toBeInstanceOf(SessionUnavailableError)
    expect(err.digest).toBe(SESSION_UNAVAILABLE_DIGEST)
  })

  it('DB timeout → SessionUnavailableError', async () => {
    vi.useFakeTimers()
    queryRaw.mockReturnValue(new Promise(() => {}))
    const p = validateSessionAgainstDb(jwtSession()).catch((e) => e)
    await vi.advanceTimersByTimeAsync(SESSION_CHECK_TIMEOUT_MS + 1)
    expect(await p).toBeInstanceOf(SessionUnavailableError)
  })
})

describe('DB unavailable → API 503 (not 401)', () => {
  it('apiError maps SessionUnavailableError to 503', async () => {
    const res = apiError(new SessionUnavailableError(new Error('down')))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('SESSION_UNAVAILABLE')
  })

  it('recognises the error by digest (survives serialisation / duplicate module copies)', () => {
    expect(isSessionUnavailableError({ digest: SESSION_UNAVAILABLE_DIGEST })).toBe(true)
    expect(isSessionUnavailableError(new Error('other'))).toBe(false)
  })
})
