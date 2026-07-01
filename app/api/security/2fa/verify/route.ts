/**
 * POST /api/security/2fa/verify
 * Body: { challenge, code }
 * On success: sets full session cookie, returns { ok: true }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyOtp } from '@/lib/otp'
import { attachSessionCookie } from '@/lib/session-token'
import { logSecurityEvent } from '@/lib/security-events'
import { resolvePostLoginPath } from '@/lib/post-login-path'

export async function POST(req: NextRequest) {
  const body = await req.json() as { challenge?: string; code?: string }
  const { challenge, code } = body

  if (!challenge || !code) {
    return NextResponse.json({ error: 'challenge and code required' }, { status: 400 })
  }

  const result = await verifyOtp(challenge, code)

  if (!result.valid || !result.userId) {
    return NextResponse.json({ error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: result.userId },
    select: {
      id: true, email: true, name: true, role: true, status: true,
      department: true, branchId: true,
      divisionId: true, departmentId: true, sectionId: true,
    },
  })

  if (!user || user.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'บัญชีไม่พร้อมใช้งาน' }, { status: 403 })
  }

  const ip        = req.headers.get('x-forwarded-for') ?? undefined
  const userAgent = req.headers.get('user-agent') ?? undefined

  await logSecurityEvent({
    userId:      user.id,
    eventType:   'LOGIN_SUCCESS',
    severity:    'INFO',
    description: 'Login completed via 2FA OTP',
    ip,
    userAgent,
  })

  const { path, message } = resolvePostLoginPath(user)

  const response = NextResponse.json({ ok: true, url: path, message })
  await attachSessionCookie(response, {
    id:         user.id,
    email:      user.email,
    name:       user.name,
    role:       user.role,
    status:     user.status,
    department: user.department ?? null,
    branchId:   user.branchId ?? null,
  })

  return response
}
