/** LINE OA Basic ID (@xxx) — ใช้เปิดแชท/เพิ่มเพื่อน */
export const DEFAULT_LINE_OA_BASIC_ID = '@593qdkpk'

export function normalizeLineOaBasicId(raw: string | null | undefined): string | null {
  const t = raw?.trim()
  if (!t) return null
  if (t.startsWith('@')) return t
  if (/^[a-zA-Z0-9._-]{4,32}$/.test(t)) return `@${t}`
  return null
}

export function getLineOaBasicId(): string {
  return (
    normalizeLineOaBasicId(process.env.NEXT_PUBLIC_LINE_OA_BASIC_ID) ??
    DEFAULT_LINE_OA_BASIC_ID
  )
}

/** เปิดแชท OA บนมือถือ/เดสก์ท็อป (line.me redirect เข้าแอป LINE) */
export function getLineOaChatUrl(basicId?: string | null): string {
  const id = (normalizeLineOaBasicId(basicId) ?? getLineOaBasicId()).replace(/^@/, '')
  return `https://line.me/R/ti/p/@${id}`
}

/** เปิดแชท OA + ใส่ข้อความล่วงหน้า (Android/iOS รองรับบางรุ่น) */
export function getLineOaChatUrlWithText(text: string, basicId?: string | null): string {
  const base = getLineOaChatUrl(basicId)
  const msg = encodeURIComponent(text.trim())
  return msg ? `${base}?msg=${msg}` : base
}
