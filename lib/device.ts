import { prisma } from '@/lib/prisma'
import type { DeviceStatus } from '@prisma/client'

/**
 * ตรวจ/ผูกเครื่องสำหรับลงเวลา — อนุมัติอัตโนมัติ ไม่บล็อกรอ HR
 * เครื่องใหม่หรือเปลี่ยน browser จะอัปเดต deviceKey ทันที
 */
export async function assertDeviceAllowed(userId: string, deviceKey: string | null) {
  const key = deviceKey?.trim()
  if (!key) {
    // ไม่บล็อกลงเวลา — client ควรส่ง key แล้ว แต่ถ้าขาดให้ผ่าน
    return { ok: true as const }
  }

  const existing = await prisma.userDevice.findUnique({ where: { userId } })

  if (!existing) {
    await prisma.userDevice.create({
      data: { userId, deviceKey: key, deviceLabel: 'Mobile', status: 'ACTIVE' },
    })
    return { ok: true as const }
  }

  if (existing.deviceKey !== key || existing.status !== 'ACTIVE') {
    await prisma.userDevice.update({
      where: { userId },
      data: {
        deviceKey: key,
        status: 'ACTIVE',
        resetRequestedAt: null,
        lastSeenAt: new Date(),
      },
    })
    console.info('[device] auto-bound attendance device', { userId })
  } else {
    await prisma.userDevice.update({
      where: { userId },
      data: { lastSeenAt: new Date() },
    })
  }

  return { ok: true as const }
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
