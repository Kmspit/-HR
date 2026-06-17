import { toast } from 'sonner'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type ApiFetchOptions = RequestInit & {
  silent?: boolean
}

export async function apiFetch<T = unknown>(
  url: string,
  options?: ApiFetchOptions,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, options)
  } catch {
    if (!options?.silent) {
      toast.error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', {
        description: 'กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต',
      })
    }
    throw new ApiError(0, 'Network error')
  }

  if (response.ok) {
    return response.json() as Promise<T>
  }

  let errorData: { error?: string } = {}
  try {
    errorData = await response.json()
  } catch { /* body may be empty */ }

  const msg = errorData.error ?? `HTTP ${response.status}`

  if (!options?.silent) {
    switch (response.status) {
      case 401:
        toast.error('Session หมดอายุ', { description: 'กรุณาเข้าสู่ระบบใหม่' })
        if (typeof window !== 'undefined') setTimeout(() => { window.location.href = '/login' }, 1500)
        break
      case 403:
        toast.error('ไม่มีสิทธิ์เข้าถึง', { description: msg })
        break
      case 404:
        toast.error('ไม่พบข้อมูล')
        break
      case 429:
        toast.error('คำขอมากเกินไป', { description: 'กรุณารอสักครู่แล้วลองใหม่' })
        break
      default:
        toast.error('เกิดข้อผิดพลาดของระบบ', { description: `รหัส: ${response.status}` })
    }
  }

  throw new ApiError(response.status, msg, errorData)
}
