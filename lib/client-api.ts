import { getDeviceKey } from '@/lib/client-device'

type ApiResult<T> = { ok: boolean; status: number; data: T }

function mergeDeviceHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers)
  if (typeof window !== 'undefined') {
    // ใช้ getDeviceKey() เพื่อสร้าง+เก็บคีย์ถาวรเสมอ (ไม่ใช่แค่ read)
    // กัน 403 "ไม่พบรหัสอุปกรณ์" กรณี DeviceBinder ยังไม่รัน / เปิดหน้า attendance ตรง ๆ / localStorage ถูกล้าง
    const key = getDeviceKey()
    if (key) headers.set('X-Device-Key', key)
  }
  return headers
}

// endpoint พวกนี้ใช้ 401 = "รหัส/OTP ผิด" หรือมีระบบ session ของตัวเอง — ไม่ใช่ session พนักงานหมดอายุ
const NON_SESSION_401_PREFIXES = ['/api/auth/', '/api/security/2fa/', '/api/client-portal/']
let redirectingToLogin = false

/** 401 จาก API = session ถูกเพิกถอน/หมดอายุ (auth() ตรวจกับ DB) → ไปหน้า login
 *  (middleware → /api/auth/session-check จะลบ cookie แล้วพากลับ /login?reason=expired)
 *  ไม่แตะ 503 — นั่นคือ DB ขัดข้องชั่วคราว ไม่ใช่ session หมดอายุ */
export function shouldRedirectToLoginOn401(input: RequestInfo | URL, currentPath: string): boolean {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const path = new URL(raw, 'http://localhost').pathname
  if (!path.startsWith('/api/')) return false
  if (NON_SESSION_401_PREFIXES.some((p) => path.startsWith(p))) return false
  if (currentPath.startsWith('/login') || currentPath.startsWith('/client-portal')) return false
  return true
}

export async function apiJson<T extends Record<string, unknown> = Record<string, unknown>>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(input, {
      ...init,
      headers: mergeDeviceHeaders(init),
      credentials: init?.credentials ?? 'include',
    })
    const text = await res.text()
    let data = {} as T
    if (text) {
      try {
        data = JSON.parse(text) as T
      } catch {
        data = { error: 'เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง' } as unknown as T
      }
    }
    if (
      res.status === 401 &&
      typeof window !== 'undefined' &&
      !redirectingToLogin &&
      shouldRedirectToLoginOn401(input, window.location.pathname)
    ) {
      redirectingToLogin = true
      window.location.assign('/login')
    }
    return { ok: res.ok, status: res.status, data }
  } catch (err) {
    console.error('[api-fetch]', String(input).slice(0, 100), err)
    return { ok: false, status: 0, data: { error: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' } as unknown as T }
  }
}

export function apiErrorMessage(
  data: Record<string, unknown>,
  fallback = 'เกิดข้อผิดพลาด',
  status?: number,
) {
  // 401/connection → ข้อความมาตรฐาน (เซิร์ฟเวอร์ตอบ 'Unauthorized' ภาษาอังกฤษ ไม่เหมาะโชว์ตรง ๆ)
  if (status === 401) return 'กรุณาเข้าสู่ระบบใหม่ (ออกจากระบบแล้วเข้าใหม่)'
  if (status === 0) return 'การเชื่อมต่ออินเทอร์เน็ตขาดหาย กรุณาตรวจสอบสัญญาณแล้วลองใหม่อีกครั้ง'

  // เซิร์ฟเวอร์ส่งเหตุผลจริงมา (เช่น ใบหน้าไม่ตรง / ยังไม่ลงทะเบียน / อุปกรณ์ไม่ตรง)
  // ต้องแสดงเหตุผลจริงก่อน ไม่ใช่เหมารวม 403 ว่าเป็น "ไม่มีสิทธิ์ใช้งาน"
  const err = data?.error
  if (typeof err === 'string' && err.length > 0) return err

  if (status === 403) return 'ไม่มีสิทธิ์ใช้งานฟังก์ชันนี้'
  return fallback
}
