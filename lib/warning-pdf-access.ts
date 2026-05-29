import { SignJWT, jwtVerify } from 'jose'

const TOKEN_TTL_SEC = 60 * 60 * 24 * 7 // 7 วัน

function secretKey() {
  const raw =
    process.env.WARNING_PDF_ACCESS_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    'hrflow-warning-pdf-dev-only'
  return new TextEncoder().encode(raw)
}

export async function createWarningPdfAccessToken(warningId: string): Promise<string> {
  return new SignJWT({ wid: warningId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SEC}s`)
    .sign(secretKey())
}

export async function verifyWarningPdfAccessToken(
  token: string,
  warningId: string,
): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secretKey())
    return payload.wid === warningId
  } catch {
    return false
  }
}

export function warningPdfSignedUrl(warningId: string, baseUrl: string, accessToken: string): string {
  const base = baseUrl.replace(/\/$/, '')
  return `${base}/api/warnings/${warningId}/pdf?access=${encodeURIComponent(accessToken)}`
}
