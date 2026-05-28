import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGO = 'aes-256-gcm'
const SALT = 'hrflow-face-v1'

function deriveKey(): Buffer {
  const secret =
    process.env.FACE_ENCRYPTION_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    'hrflow-dev-face-key'
  return scryptSync(secret, SALT, 32)
}

/** Encrypt 128-d face descriptor — never store raw images in this field */
export function encryptFaceDescriptor(embedding: number[]): string {
  const key = deriveKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const payload = JSON.stringify(embedding)
  const enc = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptFaceDescriptor(blob: string): number[] {
  const key = deriveKey()
  const buf = Buffer.from(blob, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const data = buf.subarray(28)
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const json = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  const parsed = JSON.parse(json) as unknown
  if (!Array.isArray(parsed) || parsed.length < 64) {
    throw new Error('Invalid face descriptor')
  }
  return parsed.map((v) => Number(v))
}
