const PREFIXES = ['นางสาว', 'นาง', 'นาย', 'Mr.', 'Mrs.', 'Ms.'] as const

export function splitDisplayName(name: string, storedPrefix?: string | null) {
  let rest = name.trim()
  let prefix = storedPrefix?.trim() ?? ''

  if (!prefix) {
    const sorted = [...PREFIXES].sort((a, b) => b.length - a.length)
    for (const p of sorted) {
      if (rest.startsWith(p)) {
        prefix = p
        rest = rest.slice(p.length).trim()
        break
      }
    }
  } else if (rest.startsWith(prefix)) {
    rest = rest.slice(prefix.length).trim()
  }

  const parts = rest.split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return { prefix: prefix || 'นาย', firstName: '', lastName: '' }
  }
  if (parts.length === 1) {
    return { prefix: prefix || 'นาย', firstName: parts[0], lastName: '' }
  }
  const lastName = parts[parts.length - 1]
  const firstName = parts.slice(0, -1).join(' ')
  return { prefix: prefix || 'นาย', firstName, lastName }
}

export function buildDisplayName(prefix: string, firstName: string, lastName: string) {
  const p = prefix.trim()
  const f = firstName.trim()
  const l = lastName.trim()
  const name = l ? `${f} ${l}` : f
  return `${p}${name}`.replace(/\s+/g, ' ').trim()
}

/** แปลงเบอร์เป็น 10 หลักขึ้นต้น 0 — คืน null ถ้าไม่ถูกต้อง */
export function normalizeThaiPhone(input: string): string | null {
  let digits = input.replace(/\D/g, '')
  if (digits.startsWith('66') && digits.length === 11) digits = `0${digits.slice(2)}`
  if (/^0[0-9]{9}$/.test(digits)) return digits
  return null
}
