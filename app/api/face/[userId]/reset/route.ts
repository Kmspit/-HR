import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'

/** POST /api/face/[userId]/reset — HR/Admin resets a user's face profile (soft-delete) */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['MANAGER_HR', 'ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { userId } = await params
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    const profile = await prisma.userFaceProfile.findUnique({
      where: { userId },
      select: { id: true },
    })
    if (!profile) {
      return NextResponse.json({ error: 'ไม่พบข้อมูลใบหน้าของพนักงานคนนี้' }, { status: 404 })
    }

    // Soft-delete: clear descriptor + set inactive (ไม่ลบ record เพื่อเก็บประวัติ)
    await prisma.userFaceProfile.update({
      where: { userId },
      data: {
        isActive: false,
        encryptedDescriptor: '',
        faceEmbedding: '',
      },
    })

    // Audit log
    await prisma.attendanceFaceLog.create({
      data: {
        userId,
        action: 'reset',
        method: 'manual',
        matched: false,
        failureReason: `reset_by:${session.user.id}`,
        matchScore: null,
        livenessScore: null,
        spoofFlags: null,
        attendanceId: null,
      },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
