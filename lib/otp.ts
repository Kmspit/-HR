/**
 * OTP generation and verification — purpose-scoped, attempt-limited.
 */
import { prisma } from '@/lib/prisma'
import { randomUUID, randomInt, timingSafeEqual } from 'crypto'

const OTP_TTL_MS = 15 * 60 * 1000
const MAX_VERIFY_ATTEMPTS = 5

export type OtpPurpose = 'TWO_FA_LOGIN' | 'FORGOT_PASSWORD' | 'TWO_FA_DISABLE'

function generateCode(): string {
  return String(randomInt(100_000, 999_999))
}

export async function createOtp(
  userId: string,
  purpose: OtpPurpose,
  channel = 'LINE',
): Promise<{ challenge: string; code: string }> {
  const challenge = randomUUID()
  const code = generateCode()
  const expiresAt = new Date(Date.now() + OTP_TTL_MS)

  await prisma.otpCode.create({
    data: {
      userId,
      challenge,
      code,
      channel,
      purpose,
      attempts: 0,
      expiresAt,
    },
  })
  return { challenge, code }
}

export async function verifyOtp(
  challenge: string,
  code: string,
  expectedPurpose: OtpPurpose,
): Promise<{ valid: boolean; userId?: string; error?: string }> {
  const otp = await prisma.otpCode.findUnique({ where: { challenge } })

  if (!otp) return { valid: false, error: 'invalid' }
  if (otp.used) return { valid: false, error: 'used' }
  if (otp.expiresAt < new Date()) return { valid: false, error: 'expired' }
  if ((otp.purpose ?? 'TWO_FA_LOGIN') !== expectedPurpose) {
    return { valid: false, error: 'wrong_purpose' }
  }
  if ((otp.attempts ?? 0) >= MAX_VERIFY_ATTEMPTS) {
    return { valid: false, error: 'locked' }
  }

  const a = Buffer.from(code)
  const b = Buffer.from(otp.code)
  const codeOk = a.length === b.length && timingSafeEqual(a, b)

  if (!codeOk) {
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    })
    return { valid: false, error: 'invalid_code' }
  }

  await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } })
  return { valid: true, userId: otp.userId }
}
