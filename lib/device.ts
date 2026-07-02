import { prisma } from '@/lib/prisma'
import type { DeviceStatus } from '@prisma/client'

export type DeviceAllowResult =
  | { ok: true }
  | {
      ok: false
      code: 'MISSING_DEVICE_KEY' | 'DEVICE_MISMATCH' | 'DEVICE_NOT_ACTIVE'
      error: string
    }

/**
 * ตรวจ/ผูกเครื่องสำหรับลงเวลา — ครั้งแรกลงทะเบียนอัตโนมัติ, ครั้งถัดไปต้องตรง key และ ACTIVE
 */
export async function assertDeviceAllowed(
  userId: string,
  deviceKey: string | null,
): Promise<DeviceAllowResult> {
  const key = deviceKey?.trim()
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
      data: { userId, deviceKey: key, deviceLabel: 'Mobile', status: 'ACTIVE' },
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
    return {
      ok: false,
      code: 'DEVICE_MISMATCH',
      error: 'เครื่องนี้ไม่ตรงกับที่ลงทะเบียน — ใช้เครื่องเดิมหรือขอ reset จาก HR',
    }
  }

  await prisma.userDevice.update({
    where: { userId },
    data: { lastSeenAt: new Date() },
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
