import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGO = 'aes-256-gcm'

/** Same fallback chain as lib/face-crypto.ts, deliberately — one more env var
 *  is one more thing to get the scope wrong on, and this app has hit that
 *  three times already. Each caller passes its own `salt` so a compromised
 *  key for one field never derives another field's key from the same secret. */
function deriveKey(salt: string): Buffer {
  const secret =
    process.env.FACE_ENCRYPTION_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    'hrflow-dev-field-key'
  return scryptSync(secret, salt, 32)
}

/** Generic string-field encryption (nationalId, bank account numbers, etc.) —
 *  pick a salt unique to the field via FIELD_SALTS below. */
export function encryptField(value: string, salt: string): string {
  const key = deriveKey(salt)
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptField(blob: string, salt: string): string {
  const key = deriveKey(salt)
  const buf = Buffer.from(blob, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const data = buf.subarray(28)
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

/** One salt per encrypted field — never share a salt across two fields (see
 *  deriveKey's comment). Add new entries here as new encrypted fields ship. */
export const FIELD_SALTS = {
  DEPENDENT_NATIONAL_ID: 'hrflow-dependent-id-v1',
  /** Shared by BankAccount.accountNameEnc and .accountNumberEnc — both
   *  describe the same real-world account and are always read/decrypted
   *  together, unlike DEPENDENT_NATIONAL_ID's separate-category reasoning. */
  BANK_ACCOUNT: 'hrflow-bank-v1',
} as const
