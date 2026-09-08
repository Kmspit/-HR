import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGO = 'aes-256-gcm'

/** scryptSync is deliberately slow (~35-40ms/call on typical hardware) — that's
 *  the point of a KDF, to resist offline brute-forcing of the source secret.
 *  But the derived key only ever depends on the (fixed, per-process) env
 *  secret and a fixed per-field salt, so re-deriving it on every single
 *  encrypt/decrypt call bought nothing: same input, same output, every time.
 *  Measured cost before caching: bulk payslip sends (up to 15 payrolls per
 *  request) paid ~40ms of pure key-derivation per payroll for no reason. */
const keyCache = new Map<string, Buffer>()

/** Same fallback chain as lib/face-crypto.ts, deliberately — one more env var
 *  is one more thing to get the scope wrong on, and this app has hit that
 *  three times already. Each caller passes its own `salt` so a compromised
 *  key for one field never derives another field's key from the same secret. */
function deriveKey(salt: string): Buffer {
  const cached = keyCache.get(salt)
  if (cached) return cached
  const secret =
    process.env.FACE_ENCRYPTION_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    'hrflow-dev-field-key'
  const key = scryptSync(secret, salt, 32)
  keyCache.set(salt, key)
  return key
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
  /** User.nationalIdEncrypted — nationalId-encryption Phase 1. Separate from
   *  DEPENDENT_NATIONAL_ID even though both encrypt a Thai national ID: a
   *  compromised key for one must never help decrypt the other, and the two
   *  values belong to different data subjects (the employee vs. a dependent
   *  who never consented to this system holding their ID at all). */
  USER_NATIONAL_ID: 'hrflow-user-nationalid-v1',
} as const
