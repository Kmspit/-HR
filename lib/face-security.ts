import { prisma } from '@/lib/prisma'
import { createNotification, notifyRole } from '@/lib/notifications'

const SECURITY_FAILURES = new Set([
  'face_mismatch',
  'security_face_mismatch',
  'liveness_failed',
  'spoof_detected',
  'not_registered',
  'wrong_user',
])

export async function notifyFaceSecurityAlert(params: {
  userId: string
  userName: string
  action: string
  failureReason: string
  logId: string
  distance?: number | null
}) {
  const title = '⚠️ แจ้งเตือนความผิดปกติ — ยืนยันใบหน้า'
  const detail =
    params.failureReason === 'face_mismatch' || params.failureReason === 'security_face_mismatch'
      ? 'ใบหน้าไม่ตรงกับที่ลงทะเบียน (อาจมีการสลับคนสแกน)'
      : params.failureReason === 'spoof_detected'
        ? 'ตรวจพบความเสี่ยง spoof / ไม่ใช่กล้องสด'
        : 'การยืนยันใบหน้าล้มเหลว'

  const message = `${params.userName} · ${params.action} — ${detail}${params.distance != null ? ` (distance ${params.distance.toFixed(3)})` : ''}`

  await Promise.all([
    createNotification({
      userId: params.userId,
      title,
      message: `${detail} — ลงเวลาไม่สำเร็จ กรุณาติดต่อ HR`,
      type: 'WARNING_ISSUED',
      link: '/attendance',
    }),
    notifyRole('MANAGER_HR', 'WARNING_ISSUED', title, message, '/attendance'),
    notifyRole('ADMIN', 'WARNING_ISSUED', title, message, '/attendance'),
  ]).catch((err) => console.error('[face-security]', err))
}

export function isSecurityFailure(reason: string | null | undefined): boolean {
  return !!reason && SECURITY_FAILURES.has(reason)
}

export async function countRecentFaceMismatches(userId: string, hours = 24): Promise<number> {
  const since = new Date(Date.now() - hours * 3600 * 1000)
  return prisma.attendanceFaceLog.count({
    where: {
      userId,
      matched: false,
      failureReason: { in: ['face_mismatch', 'security_face_mismatch'] },
      createdAt: { gte: since },
    },
  })
}
