/**
 * OTP generation and verification — Phase 15
 * 6-digit numeric code, 15-minute expiry, tied to a challenge UUID.
 */
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

const OTP_TTL_MS = 15 * 60 * 1000

function generateCode(): string {
  const n = Math.floor(100_000 + Math.random() * 900_000)
  return String(n)
}

export async function createOtp(userId: string, channel = 'LINE'): Promise<{ challenge: string; code: string }> {
  const challenge = randomUUID()
  const code      = generateCode()
  const expiresAt = new Date(Date.now() + OTP_TTL_MS)

  await prisma.otpCode.create({ data: { userId, challenge, code, channel, expiresAt } })
  return { challenge, code }
}

export async function verifyOtp(challenge: string, code: string): Promise<{ valid: boolean; userId?: string }> {
  const otp = await prisma.otpCode.findUnique({ where: { challenge } })

  if (!otp) return { valid: false }
  if (otp.used) return { valid: false }
  if (otp.expiresAt < new Date()) return { valid: false }
  if (otp.code !== code) return { valid: false }

  await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } })
  return { valid: true, userId: otp.userId }
}
