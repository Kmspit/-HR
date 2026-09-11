import { prisma } from '@/lib/prisma'
import type { DeviceStatus } from '@prisma/client'
import { classifyDeviceAnomaly } from '@/lib/device-anomaly'
import { logSecurityEvent } from '@/lib/security-events'

export type DeviceAllowResult =
  | { ok: true }
  | {
      ok: false
      code: 'MISSING_DEVICE_KEY' | 'DEVICE_MISMATCH' | 'DEVICE_NOT_ACTIVE'
      error: string
    }

export type DeviceRequestContext = {
  userAgent?: string | null
  ip?: string | null
}

/**
 * ตรวจ/ผูกเครื่องสำหรับลงเวลา — ครั้งแรกลงทะเบียนอัตโนมัติ, ครั้งถัดไปต้องตรง key และ ACTIVE
 *
 * `context` (userAgent/ip) is for anomaly logging only (see
 * lib/device-anomaly.ts) — this is NOT a hard-block gate, face match +
 * liveness remain the primary defense. Logging is fire-and-forget
 * (logSecurityEvent never throws, and we deliberately don't await it) so it
 * never adds latency to the checkin/checkout/lunch response.
 */
export async function assertDeviceAllowed(
  userId: string,
  deviceKey: string | null,
  context?: DeviceRequestContext,
): Promise<DeviceAllowResult> {
  const key = deviceKey?.trim()
  const userAgent = context?.userAgent?.trim().slice(0, 500) || null
  const ip = context?.ip?.trim() || null

  if (!key) {
    return {
      ok: false,
      code: 'MISSING_DEVICE_KEY',
      error: 'ต้องระบุรหัสอุปกรณ์ — ลงทะเบียนเครื่องในแอปก่อนลงเวลา',
    }
  }

  const existing = await prisma.userDevice.findUnique({ where: { userId } })

  if (!existing) {
    await prisma.userDevice.create({
      data: {
        userId,
        deviceKey: key,
        deviceLabel: 'Mobile',
        status: 'ACTIVE',
        lastUserAgent: userAgent,
        lastIpAddress: ip,
      },
    })
    return { ok: true }
  }

  if (existing.status !== 'ACTIVE') {
    return {
      ok: false,
      code: 'DEVICE_NOT_ACTIVE',
      error: 'เครื่องนี้ถูกระงับ — ติดต่อ HR เพื่อปลดล็อก',
    }
  }

  if (existing.deviceKey !== key) {
    void logSecurityEvent({
      userId,
      eventType: 'DEVICE_MISMATCH',
      severity: 'WARNING',
      description: 'พยายามลงเวลาด้วยรหัสอุปกรณ์ที่ไม่ตรงกับที่ลงทะเบียนไว้',
      ip: ip ?? undefined,
      userAgent: userAgent ?? undefined,
      metadata: {
        registeredDeviceKeyPrefix: existing.deviceKey.slice(0, 8),
        attemptedDeviceKeyPrefix: key.slice(0, 8),
      },
    })
    return {
      ok: false,
      code: 'DEVICE_MISMATCH',
      error: 'เครื่องนี้ไม่ตรงกับที่ลงทะเบียน — ใช้เครื่องเดิมหรือขอ reset จาก HR',
    }
  }

  const anomaly = classifyDeviceAnomaly({
    lastUserAgent: existing.lastUserAgent,
    lastIpAddress: existing.lastIpAddress,
    newUserAgent: userAgent,
    newIpAddress: ip,
  })
  if (anomaly.anomaly) {
    void logSecurityEvent({
      userId,
      eventType: 'DEVICE_ANOMALY',
      severity: anomaly.severity,
      description: anomaly.reason,
      ip: ip ?? undefined,
      userAgent: userAgent ?? undefined,
      metadata: {
        lastUserAgent: existing.lastUserAgent,
        newUserAgent: userAgent,
        lastIpAddress: existing.lastIpAddress,
        newIpAddress: ip,
      },
    })
  }

  await prisma.userDevice.update({
    where: { userId },
    data: { lastSeenAt: new Date(), lastUserAgent: userAgent, lastIpAddress: ip },
  })

  return { ok: true }
}

export async function registerDevice(userId: string, deviceKey: string, deviceLabel?: string) {
  const key = deviceKey.trim()
  if (!key) {
    return { status: 'ACTIVE' as DeviceStatus, message: 'ไม่พบรหัสอุปกรณ์' }
  }

  const existing = await prisma.userDevice.findUnique({ where: { userId } })

  if (!existing) {
    await prisma.userDevice.create({
      data: { userId, deviceKey: key, deviceLabel: deviceLabel ?? 'Mobile', status: 'ACTIVE' },
    })
    return { status: 'ACTIVE' as DeviceStatus, message: 'ลงทะเบียนเครื่องสำเร็จ' }
  }

  if (existing.deviceKey !== key || existing.status !== 'ACTIVE') {
    await prisma.userDevice.update({
      where: { userId },
      data: {
        deviceKey: key,
        status: 'ACTIVE',
        resetRequestedAt: null,
        lastSeenAt: new Date(),
        ...(deviceLabel ? { deviceLabel } : {}),
      },
    })
    return { status: 'ACTIVE' as DeviceStatus, message: 'อัปเดตเครื่องแล้ว' }
  }

  await prisma.userDevice.update({
    where: { userId },
    data: { lastSeenAt: new Date() },
  })
  return { status: 'ACTIVE' as DeviceStatus, message: 'เครื่องนี้ลงทะเบียนแล้ว' }
}
