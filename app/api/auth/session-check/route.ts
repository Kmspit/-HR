import { NextRequest, NextResponse } from 'next/server'
import { readJwtSession } from '@/lib/auth'
import { validateSessionAgainstDb, isSessionUnavailableError, SESSION_EXPIRED_REASON } from '@/lib/session-validate'
import { clearSessionCookie } from '@/lib/session-token'
import { ROLE_DEFAULT_ROUTE } from '@/lib/access-control'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UNAVAILABLE_HTML = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ระบบขัดข้องชั่วคราว</title>
<style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;display:flex;min-height:100dvh;align-items:center;justify-content:center;margin:0;padding:16px}
main{max-width:420px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;text-align:center}
a{display:inline-block;margin-top:16px;padding:10px 20px;background:#16a34a;color:#fff;border-radius:8px;text-decoration:none}
@media (prefers-color-scheme:dark){body{background:#020617;color:#f1f5f9}main{background:#0f172a;border-color:#1e293b}}</style></head>
<body><main><h1>ระบบขัดข้องชั่วคราว</h1><p>ไม่สามารถตรวจสอบการเข้าสู่ระบบได้ในขณะนี้ กรุณาลองใหม่อีกครั้งในอีกสักครู่</p>
<a href="/api/auth/session-check">ลองใหม่</a></main></body></html>`

/**
 * middleware ส่งผู้ใช้ที่ "มี JWT" แต่เปิดหน้า login มาที่นี่ (middleware อยู่บน edge ตรวจ DB ไม่ได้)
 *   - session ใช้ได้ → ไปหน้าแรกของ role (ตาม DB)
 *   - session ใช้ไม่ได้ (ปิดบัญชี/เปลี่ยน role/เปลี่ยนรหัสผ่าน/ลบ user) → ลบ cookie แล้วไป /login?reason=expired
 *   - DB ขัดข้อง → 503 หน้า "ระบบขัดข้องชั่วคราว" และไม่ลบ cookie
 */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const jwt = await readJwtSession()
  if (!jwt?.user?.id) {
    return clearSessionCookie(NextResponse.redirect(new URL('/login', origin)))
  }

  let session
  try {
    session = await validateSessionAgainstDb(jwt)
  } catch (err) {
    if (!isSessionUnavailableError(err)) throw err
    return new NextResponse(UNAVAILABLE_HTML, {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '30', 'Cache-Control': 'no-store' },
    })
  }

  if (!session) {
    const url = new URL('/login', origin)
    url.searchParams.set('reason', SESSION_EXPIRED_REASON)
    return clearSessionCookie(NextResponse.redirect(url))
  }
  return NextResponse.redirect(new URL(ROLE_DEFAULT_ROUTE[session.user.role] ?? '/', origin))
}
