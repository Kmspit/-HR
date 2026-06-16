import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

const COOKIE_NAME = 'cp_token'
const MAX_AGE    = 60 * 60 * 24 * 7 // 7 days

function secret() {
  return new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? 'cp-fallback-secret-change-in-prod')
}

export interface PortalSession {
  portalUserId:   string
  clientCompanyId: string
  email:          string
  fullName:       string
}

export async function signPortalToken(payload: PortalSession): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret())
}

export async function verifyPortalToken(token: string): Promise<PortalSession | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    return payload as unknown as PortalSession
  } catch {
    return null
  }
}

export async function getPortalSession(req?: NextRequest): Promise<PortalSession | null> {
  let token: string | undefined

  if (req) {
    token = req.cookies.get(COOKIE_NAME)?.value
  } else {
    const store = await cookies()
    token = store.get(COOKIE_NAME)?.value
  }

  if (!token) return null
  return verifyPortalToken(token)
}

export function portalCookieOptions() {
  return {
    name:     COOKIE_NAME,
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path:     '/',
    maxAge:   MAX_AGE,
  }
}

export function clearPortalCookie() {
  return {
    name:    COOKIE_NAME,
    value:   '',
    maxAge:  0,
    path:    '/',
    httpOnly: true,
  }
}
