import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userDevice: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}))

vi.mock('@/lib/security-events', () => ({
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/prisma'
import { logSecurityEvent } from '@/lib/security-events'
import { assertDeviceAllowed } from '@/lib/device'

const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const ANDROID_FIREFOX = 'Mozilla/5.0 (Android 14; Mobile; rv:126.0) Gecko/126.0 Firefox/126.0'

describe('assertDeviceAllowed', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects with MISSING_DEVICE_KEY when no key is given', async () => {
    const result = await assertDeviceAllowed('u1', null)
    expect(result).toEqual({
      ok: false,
      code: 'MISSING_DEVICE_KEY',
      error: expect.any(String),
    })
    expect(prisma.userDevice.findUnique).not.toHaveBeenCalled()
  })

  it('rejects with MISSING_DEVICE_KEY for a blank/whitespace-only key', async () => {
    const result = await assertDeviceAllowed('u1', '   ')
    expect(result.ok).toBe(false)
  })

  it('auto-registers on first-ever check, storing the UA/IP as the baseline', async () => {
    vi.mocked(prisma.userDevice.findUnique).mockResolvedValue(null)

    const result = await assertDeviceAllowed('u1', 'device-key-1', {
      userAgent: ANDROID_CHROME,
      ip: '1.2.3.4',
    })

    expect(result).toEqual({ ok: true })
    expect(prisma.userDevice.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        deviceKey: 'device-key-1',
        deviceLabel: 'Mobile',
        status: 'ACTIVE',
        lastUserAgent: ANDROID_CHROME,
        lastIpAddress: '1.2.3.4',
      },
    })
    expect(logSecurityEvent).not.toHaveBeenCalled()
  })

  it('rejects with DEVICE_NOT_ACTIVE when the registered device is not ACTIVE', async () => {
    vi.mocked(prisma.userDevice.findUnique).mockResolvedValue({
      userId: 'u1', deviceKey: 'device-key-1', status: 'LOCKED', lastUserAgent: null, lastIpAddress: null,
    } as never)

    const result = await assertDeviceAllowed('u1', 'device-key-1')
    expect(result).toEqual({
      ok: false,
      code: 'DEVICE_NOT_ACTIVE',
      error: expect.any(String),
    })
    expect(logSecurityEvent).not.toHaveBeenCalled()
  })

  it('logs DEVICE_MISMATCH as a WARNING SecurityEvent when the device key does not match', async () => {
    vi.mocked(prisma.userDevice.findUnique).mockResolvedValue({
      userId: 'u1', deviceKey: 'registered-key', status: 'ACTIVE', lastUserAgent: null, lastIpAddress: null,
    } as never)

    const result = await assertDeviceAllowed('u1', 'attacker-key', { userAgent: ANDROID_CHROME, ip: '9.9.9.9' })

    expect(result).toEqual({ ok: false, code: 'DEVICE_MISMATCH', error: expect.any(String) })
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        eventType: 'DEVICE_MISMATCH',
        severity: 'WARNING',
        ip: '9.9.9.9',
        userAgent: ANDROID_CHROME,
      }),
    )
    // never updates lastSeenAt/lastUserAgent/lastIpAddress on a rejected mismatch
    expect(prisma.userDevice.update).not.toHaveBeenCalled()
  })

  it('does not log anything when the device matches and UA/IP are unchanged from the baseline', async () => {
    vi.mocked(prisma.userDevice.findUnique).mockResolvedValue({
      userId: 'u1', deviceKey: 'k1', status: 'ACTIVE', lastUserAgent: ANDROID_CHROME, lastIpAddress: '1.2.3.4',
    } as never)

    const result = await assertDeviceAllowed('u1', 'k1', { userAgent: ANDROID_CHROME, ip: '1.2.3.4' })

    expect(result).toEqual({ ok: true })
    expect(logSecurityEvent).not.toHaveBeenCalled()
    expect(prisma.userDevice.update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { lastSeenAt: expect.any(Date), lastUserAgent: ANDROID_CHROME, lastIpAddress: '1.2.3.4' },
    })
  })

  it('logs a WARNING DEVICE_ANOMALY when the OS/platform changes on the same device key', async () => {
    vi.mocked(prisma.userDevice.findUnique).mockResolvedValue({
      userId: 'u1', deviceKey: 'k1', status: 'ACTIVE', lastUserAgent: ANDROID_CHROME, lastIpAddress: '1.2.3.4',
    } as never)

    const result = await assertDeviceAllowed('u1', 'k1', { userAgent: IOS_SAFARI, ip: '1.2.3.4' })

    expect(result).toEqual({ ok: true })
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', eventType: 'DEVICE_ANOMALY', severity: 'WARNING' }),
    )
  })

  it('logs an INFO DEVICE_ANOMALY when only the browser changes (same OS)', async () => {
    vi.mocked(prisma.userDevice.findUnique).mockResolvedValue({
      userId: 'u1', deviceKey: 'k1', status: 'ACTIVE', lastUserAgent: ANDROID_CHROME, lastIpAddress: '1.2.3.4',
    } as never)

    const result = await assertDeviceAllowed('u1', 'k1', { userAgent: ANDROID_FIREFOX, ip: '1.2.3.4' })

    expect(result).toEqual({ ok: true })
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', eventType: 'DEVICE_ANOMALY', severity: 'INFO' }),
    )
  })

  it('escalates severity to CRITICAL when IP and OS/platform change together', async () => {
    vi.mocked(prisma.userDevice.findUnique).mockResolvedValue({
      userId: 'u1', deviceKey: 'k1', status: 'ACTIVE', lastUserAgent: ANDROID_CHROME, lastIpAddress: '1.2.3.4',
    } as never)

    const result = await assertDeviceAllowed('u1', 'k1', { userAgent: IOS_SAFARI, ip: '9.9.9.9' })

    expect(result).toEqual({ ok: true })
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'DEVICE_ANOMALY', severity: 'CRITICAL' }),
    )
  })

  it('always updates lastUserAgent/lastIpAddress to the new values, whether or not an anomaly was logged', async () => {
    vi.mocked(prisma.userDevice.findUnique).mockResolvedValue({
      userId: 'u1', deviceKey: 'k1', status: 'ACTIVE', lastUserAgent: ANDROID_CHROME, lastIpAddress: '1.2.3.4',
    } as never)

    await assertDeviceAllowed('u1', 'k1', { userAgent: IOS_SAFARI, ip: '9.9.9.9' })

    expect(prisma.userDevice.update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { lastSeenAt: expect.any(Date), lastUserAgent: IOS_SAFARI, lastIpAddress: '9.9.9.9' },
    })
  })

  it('does not await logSecurityEvent — resolves even if the log call hangs (fire-and-forget)', async () => {
    vi.mocked(prisma.userDevice.findUnique).mockResolvedValue({
      userId: 'u1', deviceKey: 'k1', status: 'ACTIVE', lastUserAgent: ANDROID_CHROME, lastIpAddress: '1.2.3.4',
    } as never)
    // A logSecurityEvent that never resolves would hang the whole test if assertDeviceAllowed awaited it.
    vi.mocked(logSecurityEvent).mockReturnValue(new Promise(() => {}))

    const result = await assertDeviceAllowed('u1', 'k1', { userAgent: IOS_SAFARI, ip: '1.2.3.4' })
    expect(result).toEqual({ ok: true })
  })

  it('treats a missing context (no userAgent/ip passed) as null baseline values, not a crash', async () => {
    vi.mocked(prisma.userDevice.findUnique).mockResolvedValue({
      userId: 'u1', deviceKey: 'k1', status: 'ACTIVE', lastUserAgent: null, lastIpAddress: null,
    } as never)

    const result = await assertDeviceAllowed('u1', 'k1')
    expect(result).toEqual({ ok: true })
    expect(logSecurityEvent).not.toHaveBeenCalled()
  })
})
