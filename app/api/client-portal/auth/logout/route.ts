import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { getPortalSession, clearPortalCookie } from '@/lib/portal-auth'

export async function POST(req: NextRequest) {
  const session = await getPortalSession(req)

  if (session) {
    void prisma.clientPortalLog.create({
      data: {
        portalUserId: session.portalUserId,
        action:       'LOGOUT',
        ipAddress:    req.headers.get('x-forwarded-for') ?? undefined,
        userAgent:    req.headers.get('user-agent') ?? undefined,
      },
    }).catch(() => undefined)
  }

  const res = NextResponse.json({ ok: true })
  const clear = clearPortalCookie()
  res.cookies.set(clear.name, clear.value, { maxAge: 0, path: clear.path, httpOnly: clear.httpOnly })
  return res
}
