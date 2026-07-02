import { SignJWT, jwtVerify } from 'jose'

const SCAN_IMAGE_TTL_SEC = 60 * 15
/** LINE ดึงรูปช้ากว่า UI — ให้ token ยาวขึ้น */
const SCAN_IMAGE_LINE_TTL_SEC = 60 * 60 * 2

function secretKey() {
  const raw =
    process.env.ATTENDANCE_SCAN_IMAGE_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim()
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ATTENDANCE_SCAN_IMAGE_SECRET or NEXTAUTH_SECRET is required in production')
    }
    return new TextEncoder().encode('hrflow-scan-image-dev-only')
  }
  return new TextEncoder().encode(raw)
}

export async function createScanImageAccessToken(scanId: string): Promise<string> {
  return new SignJWT({ sid: scanId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SCAN_IMAGE_TTL_SEC}s`)
    .sign(secretKey())
}

export async function createScanImageAccessTokenForLine(scanId: string): Promise<string> {
  return new SignJWT({ sid: scanId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SCAN_IMAGE_LINE_TTL_SEC}s`)
    .sign(secretKey())
}

export async function verifyScanImageAccessToken(
  token: string,
  scanId: string,
): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secretKey())
    return payload.sid === scanId
  } catch {
    return false
  }
}

export function signedScanImageUrl(scanId: string, baseUrl: string, accessToken: string): string {
  const base = baseUrl.replace(/\/$/, '')
  return `${base}/api/attendance/scan-image/${scanId}?access=${encodeURIComponent(accessToken)}`
}
