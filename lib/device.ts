import { prisma } from '@/lib/prisma'
import type { DeviceStatus } from '@prisma/client'

export async function assertDeviceAllowed(userId: string, deviceKey: string | null) {
  if (!deviceKey?.trim()) {
    return { ok: false as const, error: 'ไม่พบรหัสอุปกรณ์ กรุณาเปิดแอปจากมือถือที่ลงทะเบียน' }
  }

  const existing = await prisma.userDevice.findUnique({ where: { userId } })

  if (!existing) {
    await prisma.userDevice.create({
      data: { userId, deviceKey: deviceKey.trim(), deviceLabel: 'Mobile' },
    })
    return { ok: true as const }
  }

  if (existing.status === 'PENDING_RESET') {
    return { ok: false as const, error: 'รอ HR อนุมัติการเปลี่ยนเครื่อง' }
  }

  if (existing.deviceKey !== deviceKey.trim()) {
    await prisma.userDevice.update({
      where: { userId },
      data: { status: 'PENDING_RESET', resetRequestedAt: new Date() },
    })
    return { ok: false as const, error: 'บัญชีนี้ผูกกับมือถือเครื่องอื่นแล้ว — ส่งคำขอเปลี่ยนเครื่องแล้ว รอ HR อนุมัติ' }
  }

  await prisma.userDevice.update({
    where: { userId },
    data: { lastSeenAt: new Date() },
  })
  return { ok: true as const }
}

export async function registerDevice(userId: string, deviceKey: string, deviceLabel?: string) {
  const key = deviceKey.trim()
  const existing = await prisma.userDevice.findUnique({ where: { userId } })

  if (!existing) {
    await prisma.userDevice.create({
      data: { userId, deviceKey: key, deviceLabel: deviceLabel ?? 'Mobile', status: 'ACTIVE' },
    })
    return { status: 'ACTIVE' as DeviceStatus, message: 'ลงทะเบียนเครื่องสำเร็จ' }
  }

  if (existing.deviceKey === key) {
    await prisma.userDevice.update({
      where: { userId },
      data: { lastSeenAt: new Date(), status: 'ACTIVE', resetRequestedAt: null },
    })
    return { status: 'ACTIVE' as DeviceStatus, message: 'เครื่องนี้ลงทะเบียนแล้ว' }
  }

  if (existing.status === 'ACTIVE') {
    await prisma.userDevice.update({
      where: { userId },
      data: { status: 'PENDING_RESET', resetRequestedAt: new Date() },
    })
    return { status: 'PENDING_RESET' as DeviceStatus, message: 'ส่งคำขอเปลี่ยนเครื่องแล้ว รอ HR อนุมัติ' }
  }

  return { status: existing.status, message: 'รอ HR อนุมัติการเปลี่ยนเครื่อง' }
}
