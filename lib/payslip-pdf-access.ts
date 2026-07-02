import { SignJWT, jwtVerify } from 'jose'

const TOKEN_TTL_SEC = 60 * 60 * 24 * 7 // 7 วัน

function secretKey() {
  const raw =
    process.env.PAYSLIP_PDF_ACCESS_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim()
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('PAYSLIP_PDF_ACCESS_SECRET or NEXTAUTH_SECRET is required in production')
    }
    return new TextEncoder().encode('hrflow-payslip-pdf-dev-only')
  }
  return new TextEncoder().encode(raw)
}

/** Short JWT — เก็บแค่ payrollId (publicId resolve ฝั่ง server) */
export async function createPayslipPdfAccessToken(payrollId: string): Promise<string> {
  return new SignJWT({ pid: payrollId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SEC}s`)
    .sign(secretKey())
}

export async function verifyPayslipPdfAccessToken(
  token: string,
  payrollId: string,
): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secretKey())
    return payload.pid === payrollId
  } catch {
    return false
  }
}

export function payslipLinePdfUrl(payrollId: string, baseUrl: string, accessToken: string): string {
  const base = baseUrl.replace(/\/$/, '')
  return `${base}/api/payslip/${payrollId}/line-pdf?access=${encodeURIComponent(accessToken)}&download=1`
}

export function appBaseUrl(): string {
  return (process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
}

/** ตรวจว่า base URL ใช้งานได้สำหรับลิงก์ใน LINE */
export function validateAppBaseUrl(): { ok: true; url: string } | { ok: false; error: string } {
  const url = appBaseUrl()
  if (!url) {
    return {
      ok: false,
      error: 'ไม่พบ NEXTAUTH_URL / NEXT_PUBLIC_APP_URL — ตั้งค่าบน Vercel ให้ตรง domain production',
    }
  }
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { ok: false, error: 'NEXTAUTH_URL ไม่ถูกต้อง — ต้องขึ้นต้นด้วย https://' }
    }
    if (process.env.NODE_ENV === 'production') {
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        return {
          ok: false,
          error: 'NEXTAUTH_URL ต้องเป็น domain production — ห้ามใช้ localhost บน Vercel',
        }
      }
    }
    return { ok: true, url }
  } catch {
    return { ok: false, error: 'NEXTAUTH_URL รูปแบบไม่ถูกต้อง' }
  }
}

/** LINE Flex URI limit */
export const LINE_FLEX_URI_MAX = 1000

export function assertLineFlexUriLength(uri: string): string | null {
  if (uri.length > LINE_FLEX_URI_MAX) {
    return `ลิงก์ดาวน์โหลดยาวเกิน ${LINE_FLEX_URI_MAX} ตัวอักษร (${uri.length}) — ติดต่อผู้ดูแลระบบ`
  }
  return null
}
