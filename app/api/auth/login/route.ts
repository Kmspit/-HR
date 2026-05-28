import { NextRequest, NextResponse } from 'next/server'
import { signIn } from '@/lib/auth'
import { AuthError } from 'next-auth'
import { verifyLoginCredentials } from '@/lib/login-credentials'

const ERROR_HTTP: Record<string, number> = {
  MISSING_FIELDS: 400,
  INVALID_CREDENTIALS: 401,
  PENDING_APPROVAL: 403,
  ACCOUNT_DISABLED: 403,
  ACCOUNT_REJECTED: 403,
}

/**
 * ล็อกอินฝั่งเซิร์ฟเวอร์ (ไม่พึ่ง CSRF ของ client signIn) — แก้ปัญหา PC / เบราว์เซอร์บล็อก cookie
 */
export async function POST(req: NextRequest) {
  try {
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

    try {
      await signIn('credentials', {
        email: email.trim(),
        password,
        redirectTo: '/api/auth/post-login',
        redirect: false,
      })
    } catch (err) {
      if (err instanceof AuthError) {
        return NextResponse.json(
          { ok: false, error: err.type ?? 'CredentialsSignin' },
          { status: 401 },
        )
      }
      throw err
    }

    return NextResponse.json({
      ok: true,
      url: '/api/auth/post-login',
    })
  } catch (err) {
    console.error('[api/auth/login]', err)
    return NextResponse.json(
      { ok: false, error: 'SERVER_ERROR', message: 'ระบบขัดข้อง กรุณาลองใหม่' },
      { status: 500 },
    )
  }
}
