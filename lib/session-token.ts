import { encode } from '@auth/core/jwt'
import type { NextResponse } from 'next/server'
import type { Role, UserStatus } from '@prisma/client'

const SESSION_MAX_AGE = 30 * 24 * 60 * 60

function shouldUseSecureCookies() {
  return (
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.VERCEL) ||
    process.env.AUTH_URL?.startsWith('https') === true ||
    process.env.NEXTAUTH_URL?.startsWith('https') === true
  )
}

export function getSessionCookieName() {
  const prefix = shouldUseSecureCookies() ? '__Secure-' : ''
  return `${prefix}authjs.session-token`
}

export type SessionUserPayload = {
  id: string
  email: string
  name: string
  role: Role
  status: UserStatus
  department: string | null
  branchId: string | null
  sessionEpoch?: number
}

async function buildSessionToken(user: SessionUserPayload) {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET_MISSING')

  const cookieName = getSessionCookieName()
  const token = {
    name: user.name,
    email: user.email,
    sub: user.id,
    id: user.id,
    role: user.role,
    status: user.status,
    department: user.department,
    branchId: user.branchId,
    sessionEpoch: user.sessionEpoch ?? 0,
  }

  const encoded = await encode({
    token,
    secret,
    salt: cookieName,
    maxAge: SESSION_MAX_AGE,
  })

  return { cookieName, encoded, secure: shouldUseSecureCookies() }
}

/** แนบ session cookie กับ NextResponse (เสถียรบน Vercel มากกว่า cookies().set) */
export async function attachSessionCookie(
  response: NextResponse,
  user: SessionUserPayload,
): Promise<NextResponse> {
  const { cookieName, encoded, secure } = await buildSessionToken(user)
  response.cookies.set(cookieName, encoded, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
    maxAge: SESSION_MAX_AGE,
  })
  return response
}

/** @deprecated ใช้ attachSessionCookie แทน */
export async function setSessionFromUser(user: SessionUserPayload) {
  const { cookieName, encoded, secure } = await buildSessionToken(user)
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  cookieStore.set(cookieName, encoded, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
    maxAge: SESSION_MAX_AGE,
  })
}
