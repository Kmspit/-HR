import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyLoginCredentials } from '@/lib/login-credentials'
import { setSessionFromUser } from '@/lib/session-token'
import { resolvePostLoginPath } from '@/lib/post-login-path'
import { ensureDbSchema } from '@/lib/ensure-db-schema'

const ERROR_HTTP: Record<string, number> = {
  MISSING_FIELDS: 400,
  INVALID_CREDENTIALS: 401,
  PENDING_APPROVAL: 403,
  ACCOUNT_DISABLED: 403,
  ACCOUNT_REJECTED: 403,
  AUTH_SECRET_MISSING: 500,
}

/**
 * ล็อกอิน + สร้าง session + คืน URL ปลายทาง (dashboard / org-pending)
 */
export async function POST(req: NextRequest) {
  try {
    await ensureDbSchema().catch((err) => console.error('[login] ensureDbSchema', err))

    const body = await req.json().catch(() => ({}))
    const email = typeof body.email === 'string' ? body.email : ''
    const password = typeof body.password === 'string' ? body.password : ''

    const verified = await verifyLoginCredentials(email, password)
    if (!verified.ok) {
      return NextResponse.json(
        { ok: false, error: verified.error },
        { status: ERROR_HTTP[verified.error] ?? 401 },
      )
    }

    await setSessionFromUser(verified.user)

    const dbUser = await prisma.user.findUnique({
      where: { id: verified.user.id },
      select: {
        role: true,
        status: true,
        divisionId: true,
        departmentId: true,
        sectionId: true,
      },
    })

    const { path, message } = resolvePostLoginPath(
      dbUser ?? {
        role: verified.user.role,
        status: verified.user.status,
        divisionId: null,
        departmentId: null,
        sectionId: null,
      },
    )

    return NextResponse.json({
      ok: true,
      url: path,
      message,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/auth/login]', err)

    if (msg === 'AUTH_SECRET_MISSING') {
      return NextResponse.json(
        { ok: false, error: 'AUTH_SECRET_MISSING', message: 'ระบบยังไม่ได้ตั้งค่า AUTH_SECRET' },
        { status: 500 },
      )
    }

    return NextResponse.json(
      { ok: false, error: 'SERVER_ERROR', message: 'ระบบขัดข้อง กรุณาลองใหม่' },
      { status: 500 },
    )
  }
}
