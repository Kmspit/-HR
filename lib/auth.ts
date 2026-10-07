import { cache } from 'react'
import NextAuth from 'next-auth'
import type { Session } from 'next-auth'
import { authConfig } from './auth.config'
import { validateSessionAgainstDb } from './session-validate'

/**
 * NextAuth is used only for session/JWT reading via auth().
 * Login is exclusively via POST /api/auth/login (2FA, lockout, rate limits).
 * Credentials provider intentionally omitted to prevent bypass.
 */
const nextAuth = NextAuth({
  ...authConfig,
  providers: [],
})

export const { handlers, signOut } = nextAuth

/** อ่าน JWT อย่างเดียว ไม่ตรวจ DB — ใช้เฉพาะที่ต้องรู้ว่า "มี cookie" (เช่น session-check) */
export const readJwtSession = (): Promise<Session | null> => nextAuth.auth()

/**
 * session ที่ตรวจกับ DB แล้ว (ปิดบัญชี / เปลี่ยน role / เปลี่ยนรหัสผ่าน มีผลทันที) —
 * ดู validateSessionAgainstDb ใน lib/session-validate.ts
 * DB ขัดข้อง → throw SessionUnavailableError (API → 503 ผ่าน apiError, หน้าเว็บ → error boundary)
 *
 * cache(): รวม query ภายใน render เดียวกันของ server component (layout + page + component)
 * — ใน route handler ไม่มี React render จึงไม่ได้ cache (แต่ไม่มี route ไหนเรียก auth() ซ้ำใน request เดียว)
 */
export const auth = cache(async (): Promise<Session | null> => validateSessionAgainstDb(await nextAuth.auth()))
