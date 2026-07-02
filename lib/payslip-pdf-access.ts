import { SignJWT, jwtVerify } from 'jose'

const TOKEN_TTL_SEC = 60 * 60 * 24 * 7 // 7 วัน

function secretKey() {
  const raw =
    process.env.PAYSLIP_PDF_ACCESS_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    'hrflow-payslip-pdf-dev-only'
  return new TextEncoder().encode(raw)
}

export async function createPayslipPdfAccessToken(
  payrollId: string,
  cloudinaryPublicId: string,
): Promise<string> {
  return new SignJWT({ pid: payrollId, cid: cloudinaryPublicId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SEC}s`)
    .sign(secretKey())
}

export async function verifyPayslipPdfAccessToken(
  token: string,
  payrollId: string,
): Promise<{ ok: boolean; cloudinaryPublicId?: string }> {
  try {
    const { payload } = await jwtVerify(token, secretKey())
    if (payload.pid !== payrollId) return { ok: false }
    const cid = typeof payload.cid === 'string' ? payload.cid : undefined
    if (!cid) return { ok: false }
    return { ok: true, cloudinaryPublicId: cid }
  } catch {
    return { ok: false }
  }
}

export function payslipLinePdfUrl(payrollId: string, baseUrl: string, accessToken: string): string {
  const base = baseUrl.replace(/\/$/, '')
  return `${base}/api/payslip/${payrollId}/line-pdf?access=${encodeURIComponent(accessToken)}&download=1`
}

export function appBaseUrl(): string {
  return (process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
}

/** LINE Flex URI limit */
export const LINE_FLEX_URI_MAX = 1000

export function assertLineFlexUriLength(uri: string): string | null {
  if (uri.length > LINE_FLEX_URI_MAX) {
    return `ลิงก์ดาวน์โหลดยาวเกิน ${LINE_FLEX_URI_MAX} ตัวอักษร (${uri.length}) — ติดต่อผู้ดูแลระบบ`
  }
  return null
}
