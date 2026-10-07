import { NextResponse } from 'next/server'
import { isSessionUnavailableError } from '@/lib/session-validate'

export const SESSION_UNAVAILABLE_MESSAGE = 'ระบบขัดข้องชั่วคราว — กรุณาลองใหม่อีกครั้งในอีกสักครู่'

/** auth() ตรวจ session กับ DB ไม่ได้ → 503 (ไม่ใช่ 401 — client ห้ามพาไปหน้า login) */
export function sessionUnavailableResponse() {
  return NextResponse.json({ error: SESSION_UNAVAILABLE_MESSAGE, code: 'SESSION_UNAVAILABLE' }, { status: 503 })
}

/** สำหรับ route ที่เรียก auth() นอก try/apiError — คืน 503 response หรือ throw ต่อ */
export async function authOrUnavailable<T>(load: () => Promise<T>): Promise<T | NextResponse> {
  try {
    return await load()
  } catch (err) {
    if (isSessionUnavailableError(err)) return sessionUnavailableResponse()
    throw err
  }
}
