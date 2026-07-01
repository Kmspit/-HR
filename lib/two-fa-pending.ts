import { SignJWT, jwtVerify } from 'jose'

const PURPOSE = '2fa-pending'

function secret() {
  const raw = process.env.NEXTAUTH_SECRET?.trim()
  if (!raw) throw new Error('AUTH_SECRET_MISSING')
  return new TextEncoder().encode(raw)
}

export async function create2FAPendingToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId, purpose: PURPOSE })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret())
}

export async function verify2FAPendingToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    if (payload.purpose !== PURPOSE || typeof payload.sub !== 'string') return null
    return payload.sub
  } catch {
    return null
  }
}
