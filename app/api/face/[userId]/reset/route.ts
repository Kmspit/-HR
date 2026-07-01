import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { requireCsrf } from '@/lib/api-guard'
import { buildBranchScope, isUserInBranchScope } from '@/lib/branch-scope'
import { HR_ADMIN } from '@/lib/module-gates'
import type { Role } from '@prisma/client'

/** POST /api/face/[userId]/reset — HR resets a user's face profile (soft-delete) */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const csrfErr = requireCsrf(req)
    if (csrfErr) return csrfErr

    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!HR_ADMIN.includes(session.user.role as Role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { userId } = await params
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    const scope = buildBranchScope(session.user, {})
    const inScope = await isUserInBranchScope(prisma, scope, userId)
    if (!inScope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const profile = await prisma.userFaceProfile.findUnique({
      where: { userId },
      select: { id: true },
    })
    if (!profile) {
      return NextResponse.json({ error: 'ไม่พบข้อมูลใบหน้าของพนักงานคนนี้' }, { status: 404 })
    }

    await prisma.userFaceProfile.update({
      where: { userId },
      data: {
        isActive: false,
        encryptedDescriptor: '',
        faceEmbedding: '',
      },
    })

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
