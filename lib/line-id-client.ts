/** Client-safe LINE ID check (matches server normalizeLineId) */
export function isValidLineIdInput(raw: string): boolean {
  const t = raw.trim()
  if (!t) return false
  const id = t.startsWith('@') ? t : `@${t}`
  const body = id.slice(1)
  return /^[a-zA-Z0-9._-]{4,32}$/.test(body)
}

export function lineIdHint(): string {
  return 'LINE ID (@username ภาษาอังกฤษ 4–32 ตัว เช่น kmsp.hr)'
}
