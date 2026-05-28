import { encode } from '@auth/core/jwt'
import { cookies } from 'next/headers'
import type { Role, UserStatus } from '@prisma/client'

const SESSION_MAX_AGE = 30 * 24 * 60 * 60

function useSecureCookies() {
  return (
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.VERCEL) ||
    process.env.AUTH_URL?.startsWith('https') === true ||
    process.env.NEXTAUTH_URL?.startsWith('https') === true
  )
}

export function getSessionCookieName() {
  const prefix = useSecureCookies() ? '__Secure-' : ''
  return `${prefix}authjs.session-token`
}

/** สร้าง JWT session cookie ตรงจากข้อมูล user (ไม่ผ่าน signIn — เสถียรบน Vercel/PC) */
export async function setSessionFromUser(user: {
  id: string
  email: string
  name: string
  role: Role
  status: UserStatus
  department: string | null
  branchId: string | null
}) {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!secret) {
    throw new Error('AUTH_SECRET_MISSING')
  }

  const cookieName = getSessionCookieName()
  const token = {
    name: user.name,
    email: user.email,
    picture: null,
    sub: user.id,
    id: user.id,
    role: user.role,
    status: user.status,
    department: user.department,
    branchId: user.branchId,
  }

  const encoded = await encode({
    token,
    secret,
    salt: cookieName,
    maxAge: SESSION_MAX_AGE,
  })

  const cookieStore = await cookies()
  cookieStore.set(cookieName, encoded, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: useSecureCookies(),
    maxAge: SESSION_MAX_AGE,
  })
}
